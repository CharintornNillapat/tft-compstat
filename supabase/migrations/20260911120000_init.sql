-- TFT CompStat — initial schema. Source of truth: context/architecture.md §4.
--
-- Access model: public read, locked writes.
--   * anon/authenticated may SELECT the public tables (RLS "public read" policies).
--   * matches (raw lobby data) and sync_state are server-only.
--   * No INSERT/UPDATE/DELETE policies exist: all writes use the service role.
-- Future migrations that add tables must repeat the explicit grants/RLS pattern at the bottom.

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type public.tier_rank   as enum ('S', 'A', 'B', 'C');
create type public.item_kind   as enum ('component', 'completed', 'emblem', 'artifact', 'radiant', 'support', 'other');
create type public.comp_style  as enum ('fast8', 'fast9', 'reroll_1', 'reroll_2', 'reroll_3', 'flex');
create type public.sync_status as enum ('idle', 'running', 'ok', 'error', 'rate_limited');

-- ─── Shared trigger: keep updated_at current ────────────────────────────────

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Static reference data (CommunityDragon via scripts/sync-static.ts) ─────

create table public.tft_sets (
  id        smallint primary key,                 -- e.g. 15
  mutator   text not null,                        -- CDragon set key
  name      text not null,
  patch     text,                                 -- '15.4'
  is_active boolean not null default false
);
create unique index tft_sets_one_active_idx on public.tft_sets (is_active) where is_active;

create table public.traits (
  api_name    text primary key,                   -- = Riot traits[].name
  set_id      smallint not null references public.tft_sets (id),
  name        text not null,
  breakpoints jsonb not null,                     -- [{ "min": 2, "style": 1 }, ...]
  icon_url    text
);

create table public.champions (
  api_name text primary key,                      -- = Riot units[].character_id
  set_id   smallint not null references public.tft_sets (id),
  name     text not null,
  cost     smallint not null check (cost between 1 and 5),  -- playable units only
  traits   text[] not null default '{}',          -- trait api_names
  icon_url text
);

create table public.items (
  api_name     text primary key,                  -- = Riot itemNames[]
  name         text not null,
  kind         public.item_kind not null,
  components   text[] not null default '{}',
  grants_trait text references public.traits (api_name),  -- emblems
  icon_url     text,
  is_active    boolean not null default true
);

-- ─── Curated content (YAML via scripts/seed-curated.ts) ─────────────────────

create table public.tier_lists (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,                -- 'champions-15.4'
  kind       text not null check (kind in ('champion', 'item')),
  set_id     smallint references public.tft_sets (id),
  patch      text not null,
  title      text not null,
  notes      text,
  is_current boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index tier_lists_one_current_per_kind_idx on public.tier_lists (kind) where is_current;

create table public.tier_entries (
  id                bigint generated always as identity primary key,
  tier_list_id      uuid not null references public.tier_lists (id) on delete cascade,
  tier              public.tier_rank not null,
  position          smallint not null default 0,  -- order inside a tier row
  champion_api_name text references public.champions (api_name),
  item_api_name     text references public.items (api_name),
  note              text,
  check (num_nonnulls(champion_api_name, item_api_name) = 1),
  unique (tier_list_id, champion_api_name),
  unique (tier_list_id, item_api_name)
);
create index tier_entries_list_order_idx on public.tier_entries (tier_list_id, tier, position);

create table public.comps (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  set_id       smallint not null references public.tft_sets (id),
  patch        text not null,
  name         text not null,
  tier         public.tier_rank not null,
  style        public.comp_style not null,
  difficulty   smallint check (difficulty between 1 and 3),
  summary      text,                              -- one-line pitch
  guide_md     text,                              -- early/mid/late, positioning tips
  early_units  text[] not null default '{}',      -- champion api_names
  flex_units   text[] not null default '{}',
  is_published boolean not null default true,
  sort_order   smallint not null default 0,
  updated_at   timestamptz not null default now()
);

create table public.comp_units (
  comp_id           uuid not null references public.comps (id) on delete cascade,
  champion_api_name text not null references public.champions (api_name),
  hex_row           smallint not null check (hex_row between 0 and 3),  -- 0 = front row
  hex_col           smallint not null check (hex_col between 0 and 6),
  star_goal         smallint not null default 2 check (star_goal between 1 and 3),
  is_carry          boolean not null default false,
  items             text[] not null default '{}',  -- ≤3 item api_names (validated by seed script)
  primary key (comp_id, champion_api_name),
  unique (comp_id, hex_row, hex_col)
);

-- ─── Personal player data (written only by SyncService) ─────────────────────

create table public.riot_accounts (
  puuid           text primary key,
  game_name       text not null,
  tag_line        text not null,
  platform        text not null,                  -- 'na1' | 'euw1' | 'kr' | 'th2' ...
  profile_icon_id integer,
  summoner_level  integer,
  updated_at      timestamptz not null default now()
);

create table public.rank_snapshots (                -- appended only when tier/LP changes
  id          bigint generated always as identity primary key,
  puuid       text not null references public.riot_accounts (puuid),
  queue_type  text not null,                      -- 'RANKED_TFT'
  tier        text,
  division    text,
  lp          integer,
  wins        integer,
  losses      integer,
  captured_at timestamptz not null default now()
);
create index rank_snapshots_puuid_captured_idx on public.rank_snapshots (puuid, captured_at desc);

create table public.matches (                       -- immutable once fetched; never re-requested
  match_id      text primary key,                   -- 'TH2_1234567890'
  set_number    smallint not null,
  game_version  text not null,
  patch         text not null,                      -- derived '15.4'
  queue_id      integer not null,                   -- 1100 ranked, 1090 normal, 1130 hyper roll, 1160 double up
  game_datetime timestamptz not null,
  game_length_s real not null,
  raw           jsonb not null,                     -- full MatchDto (lobby data) — server-only
  fetched_at    timestamptz not null default now()
);

create table public.player_matches (                -- my participant row, normalized + derived
  match_id          text not null references public.matches (match_id) on delete cascade,
  puuid             text not null references public.riot_accounts (puuid),
  game_datetime     timestamptz not null,           -- denormalized for sorting
  queue_id          integer not null,
  set_number        smallint not null,
  placement         smallint not null check (placement between 1 and 8),
  level             smallint,
  last_round        smallint,
  gold_left         smallint,
  damage_to_players integer,
  time_eliminated_s real,
  traits            jsonb not null,               -- active only: [{name,num_units,style,tier_current,tier_total}]
  units             jsonb not null,               -- [{character_id,star,items[]}]
  carry_unit        text,
  primary_traits    text[] not null default '{}',
  comp_key          text,                         -- signature, architecture §6.2
  derived_version   smallint not null default 1,  -- bump → scripts/rederive.ts recomputes from raw
  primary key (match_id, puuid)
);
create index player_matches_puuid_datetime_idx on public.player_matches (puuid, game_datetime desc);

create table public.sync_state (
  puuid           text primary key references public.riot_accounts (puuid),
  status          public.sync_status not null default 'idle',
  lock_until      timestamptz,
  next_allowed_at timestamptz,                    -- cooldown / Retry-After gate
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error      text,
  last_call_count smallint,
  last_rate_limit jsonb                           -- parsed X-App/Method-Rate-Limit(-Count) headers
);

-- ─── updated_at triggers ────────────────────────────────────────────────────

create trigger tier_lists_set_updated_at before update on public.tier_lists
  for each row execute function public.set_updated_at();
create trigger comps_set_updated_at before update on public.comps
  for each row execute function public.set_updated_at();
create trigger riot_accounts_set_updated_at before update on public.riot_accounts
  for each row execute function public.set_updated_at();

-- ─── Sync lock RPC (atomic, cross-instance) — architecture §4.5 ─────────────
-- Returns the locked row, or zero rows when a sync is already running or on cooldown.
-- A crashed holder's lock expires by itself after p_lock_s seconds.

create function public.acquire_sync_lock(p_puuid text, p_lock_s integer default 90)
returns setof public.sync_state
language sql
set search_path = ''
as $$
  update public.sync_state
     set status          = 'running',
         lock_until      = now() + make_interval(secs => p_lock_s),
         last_started_at = now()
   where puuid = p_puuid
     and (lock_until is null or lock_until < now())
     and (next_allowed_at is null or next_allowed_at <= now())
  returning *;
$$;

revoke execute on function public.acquire_sync_lock(text, integer) from public, anon, authenticated;
grant execute on function public.acquire_sync_lock(text, integer) to service_role;

-- ─── Privileges & RLS ───────────────────────────────────────────────────────
-- Explicit grants so access never depends on project-level default privileges.

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.tft_sets, public.traits, public.champions, public.items,
  public.tier_lists, public.tier_entries, public.comps, public.comp_units,
  public.riot_accounts, public.rank_snapshots, public.player_matches
to anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.tft_sets       enable row level security;
alter table public.traits         enable row level security;
alter table public.champions      enable row level security;
alter table public.items          enable row level security;
alter table public.tier_lists     enable row level security;
alter table public.tier_entries   enable row level security;
alter table public.comps          enable row level security;
alter table public.comp_units     enable row level security;
alter table public.riot_accounts  enable row level security;
alter table public.rank_snapshots enable row level security;
alter table public.matches        enable row level security;  -- no policies: server-only
alter table public.player_matches enable row level security;
alter table public.sync_state     enable row level security;  -- no policies: server-only

create policy "Public read" on public.tft_sets       for select to anon, authenticated using (true);
create policy "Public read" on public.traits         for select to anon, authenticated using (true);
create policy "Public read" on public.champions      for select to anon, authenticated using (true);
create policy "Public read" on public.items          for select to anon, authenticated using (true);
create policy "Public read" on public.tier_lists     for select to anon, authenticated using (true);
create policy "Public read" on public.tier_entries   for select to anon, authenticated using (true);
create policy "Public read" on public.riot_accounts  for select to anon, authenticated using (true);
create policy "Public read" on public.rank_snapshots for select to anon, authenticated using (true);
create policy "Public read" on public.player_matches for select to anon, authenticated using (true);

create policy "Public read published" on public.comps
  for select to anon, authenticated using (is_published);

create policy "Public read units of published comps" on public.comp_units
  for select to anon, authenticated
  using (exists (select 1 from public.comps c where c.id = comp_units.comp_id and c.is_published));
