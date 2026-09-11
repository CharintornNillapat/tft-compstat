# TFT CompStat — Architecture

> **Status:** Approved design (2026-09-11). Phase 1 is implemented and its decisions are recorded below. This is the source of truth for implementation. Update it whenever a phase changes a decision.
> **Companion doc:** [`roadmap.md`](./roadmap.md)

## 0. Product scope & confirmed decisions

A minimalist, dark, data-dense TFT companion site built for a second monitor while gaming. It has three features:
1. **Meta comps showcase.** Curated comps with positioning, carries, items, traits and tier.
2. **Champion & item tier lists.** Costs 1–5, with S/A/B/C ratings.
3. **Personal player dashboard.** Scoped to **one Riot account**. It covers recent matches (last 10–20+), avg placement, top-4 rate and favorite comps.

**Non-goals:** global win-rate aggregation, multi-user accounts, crawling other players.

| Topic | Decision |
|---|---|
| Access model | **Public read, locked writes.** No logins. Anyone with the URL can view. All DB writes happen server-side with the service-role key. Riot sync is bounded by a DB lock and cooldown, and cron requires `CRON_SECRET`. |
| Curated content | **YAML seed files in the repo are the source of truth** (Zod-validated, upserted by a script, history kept in git). An optional in-app admin UI comes in Phase 5. |
| Stats computation | Cache **raw** Riot data in Supabase. Compute derived stats on read, as pure TS over ≤N rows. |

---

## 1. System overview

```
                ┌──────────────────────────── Vercel ─────────────────────────────┐
 Browser ──────►│ Next.js App Router                                              │
 (2nd monitor)  │  • Server Components read Supabase (cached, fast)               │
                │  • Server Action  refreshMyMatches()  ─┐                        │
                │  • after() stale-on-read sync ─────────┼─► SyncService          │
                │  • GET /api/cron/sync (CRON_SECRET) ───┘      │                 │
                │  • POST /api/revalidate (REVALIDATE_SECRET)    ▼                 │
                │                                  RiotClient (limiter, 429)      │
                └───────────────┬───────────────────────────────┬─────────────────┘
                                │ supabase-js                   │ HTTPS
                                ▼                               ▼
                   ┌────────── Supabase ─────────┐     Riot API (account-v1,
                   │ Postgres + RLS              │     tft-match-v1, tft-league-v1,
                   │  static · curated · player  │     tft-summoner-v1)
                   └──────────▲──────────────────┘
                              │ upsert (service role)
   Local scripts: sync-static (CommunityDragon) · seed-curated (YAML) · riot-setup · backfill · rederive
```

**Core principle:** page renders never call Riot. Pages only read Supabase. Riot is called only by `SyncService`, and every path into it goes through the same lock/cooldown gate.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3 (Turbopack), App Router, React 19.2, TypeScript `strict` + `noUncheckedIndexedAccess` | Server Components by default; Server Actions for mutations; `after()` for background sync; **Cache Components enabled** (§8) |
| Styling | Tailwind CSS v4, dark only | Design tokens in `@theme` (`src/app/globals.css`); `tabular-nums` everywhere |
| DB | Supabase Postgres + RLS | Supabase CLI migrations in `supabase/migrations/`; generated types in `src/lib/supabase/types.ts` |
| Validation | Zod | Env vars, YAML seeds, Riot DTO subset |
| Static game data | CommunityDragon `cdragon/tft/en_us.json` | Champion, trait and item names, costs, breakpoints, icons |
| Charts | Inline SVG (sparkline, placement histogram) | No chart library needed at this scale |
| Tests | Vitest | Pure functions: limiter, header parsing, comp signature, stats, seed schemas |
| Tooling | pnpm 12, ESLint 9 (flat config), Supabase CLI as a devDependency, `tsx` for scripts | Bundled Next docs live in `node_modules/next/dist/docs/`. Check them before using a Next API (see `AGENTS.md`). |
| Hosting | Vercel (Hobby) + Supabase (Free) | Hobby cron runs once a day. The daily sync also stops the Supabase free tier from auto-pausing. |

---

## 3. Directory layout (target)

```
context/                     architecture.md, roadmap.md (kept current each phase)
data/curated/<setId>/
  champion-tiers.yaml
  item-tiers.yaml
  comps/<slug>.yaml
scripts/
  sync-static.ts             CommunityDragon → tft_sets/champions/traits/items
  seed-curated.ts            YAML → tier_lists/tier_entries/comps/comp_units (+ revalidate)
  riot-setup.ts              Riot ID → puuid; insert riot_accounts + sync_state
  riot-backfill.ts           deeper history, run locally, same limiter
  rederive.ts                recompute player_matches from matches.raw (0 API calls)
supabase/migrations/         SQL (schema, RLS, RPCs)
src/app/
  page.tsx                   Overview (glance panel)
  comps/page.tsx, comps/[slug]/page.tsx
  tiers/champions/page.tsx, tiers/items/page.tsx
  me/page.tsx                Personal dashboard
  api/cron/sync/route.ts, api/revalidate/route.ts
src/components/              ChampionIcon, ItemIcon, TraitBadge, TierRow, HexBoard, PlacementPill, StatTile, Sparkline
src/lib/
  env.ts                     Zod-validated env
  supabase/{server,admin,types}.ts   admin = service role, `import 'server-only'`
  riot/{routing,client,limiter,errors,schemas,endpoints}.ts
  sync/{sync-service,derive,comp-signature}.ts
  stats/{summary,comps,champions}.ts pure functions
  curated/{schemas,queries}.ts
```

---

## 4. Supabase schema

### 4.1 Enums
```sql
create type tier_rank   as enum ('S','A','B','C');        -- extend later with ALTER TYPE ... ADD VALUE
create type item_kind   as enum ('component','completed','emblem','artifact','radiant','support','other');
create type comp_style  as enum ('fast8','fast9','reroll_1','reroll_2','reroll_3','flex');
create type sync_status as enum ('idle','running','ok','error','rate_limited');
```

### 4.2 Static reference data (from CommunityDragon via `sync-static.ts`)
```sql
create table tft_sets (
  id         smallint primary key,               -- e.g. 15
  mutator    text not null,                      -- CDragon set key
  name       text not null,
  patch      text,                               -- '15.4'
  is_active  boolean not null default false
);
create unique index one_active_set on tft_sets (is_active) where is_active;

create table traits (
  api_name    text primary key,                  -- matches Riot traits[].name
  set_id      smallint not null references tft_sets(id),
  name        text not null,
  breakpoints jsonb not null,                    -- [{ "min": 2, "style": 1 }, ...]
  icon_url    text
);

create table champions (
  api_name  text primary key,                    -- 'TFTxx_Jinx' = Riot units[].character_id
  set_id    smallint not null references tft_sets(id),
  name      text not null,
  cost      smallint not null check (cost between 1 and 5),  -- playable units only; summons filtered out
  traits    text[] not null default '{}',        -- trait api_names
  icon_url  text
);

create table items (
  api_name     text primary key,                 -- 'TFT_Item_InfinityEdge' = Riot itemNames[]
  name         text not null,
  kind         item_kind not null,
  components   text[] not null default '{}',
  grants_trait text references traits(api_name), -- emblems
  icon_url     text,
  is_active    boolean not null default true
);
```

### 4.3 Curated content (from YAML via `seed-curated.ts`)
```sql
create table tier_lists (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,              -- 'champions-15.4'
  kind        text not null check (kind in ('champion','item')),
  set_id      smallint references tft_sets(id),
  patch       text not null,
  title       text not null,
  notes       text,
  is_current  boolean not null default false,
  updated_at  timestamptz not null default now()
);
create unique index one_current_tier_list_per_kind on tier_lists (kind) where is_current;

create table tier_entries (
  id                bigint generated always as identity primary key,
  tier_list_id      uuid not null references tier_lists(id) on delete cascade,
  tier              tier_rank not null,
  position          smallint not null default 0,      -- order inside a tier row
  champion_api_name text references champions(api_name),
  item_api_name     text references items(api_name),
  note              text,
  check (num_nonnulls(champion_api_name, item_api_name) = 1)
);
create index on tier_entries (tier_list_id, tier, position);

create table comps (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  set_id       smallint not null references tft_sets(id),
  patch        text not null,
  name         text not null,
  tier         tier_rank not null,
  style        comp_style not null,
  difficulty   smallint check (difficulty between 1 and 3),
  summary      text,                              -- one-line pitch
  guide_md     text,                              -- early/mid/late, augments, positioning tips
  early_units  text[] not null default '{}',      -- champion api_names
  flex_units   text[] not null default '{}',
  is_published boolean not null default true,
  sort_order   smallint not null default 0,
  updated_at   timestamptz not null default now()
);

create table comp_units (
  comp_id           uuid not null references comps(id) on delete cascade,
  champion_api_name text not null references champions(api_name),
  hex_row           smallint not null check (hex_row between 0 and 3),  -- 0 = front row
  hex_col           smallint not null check (hex_col between 0 and 6),
  star_goal         smallint not null default 2 check (star_goal between 1 and 3),
  is_carry          boolean not null default false,
  items             text[] not null default '{}',   -- ≤3 item api_names, validated against `items` in the seed script
  primary key (comp_id, champion_api_name),
  unique (comp_id, hex_row, hex_col)
);
```

Active traits for a comp are **computed in the app** from `comp_units → champions.traits` (+ emblem `items.grants_trait`) against `traits.breakpoints`. They are never stored, so they can't drift.

### 4.4 Personal player data (written only by SyncService)
```sql
create table riot_accounts (
  puuid           text primary key,
  game_name       text not null,
  tag_line        text not null,
  platform        text not null,                 -- 'na1' | 'euw1' | 'kr' | 'th2' ...
  profile_icon_id int,
  summoner_level  int,
  updated_at      timestamptz not null default now()
);

create table rank_snapshots (                    -- appended only when LP/tier changes → LP history
  id          bigint generated always as identity primary key,
  puuid       text not null references riot_accounts(puuid),
  queue_type  text not null,                     -- 'RANKED_TFT'
  tier        text, division text, lp int, wins int, losses int,
  captured_at timestamptz not null default now()
);
create index on rank_snapshots (puuid, captured_at desc);

create table matches (                           -- immutable once fetched; never re-requested
  match_id      text primary key,                -- 'NA1_1234567890'
  set_number    smallint not null,
  game_version  text not null,
  patch         text not null,                   -- derived '15.4'
  queue_id      int not null,                    -- 1100 ranked, 1090 normal, 1130 hyper roll, 1160 double up
  game_datetime timestamptz not null,
  game_length_s real not null,
  raw           jsonb not null,                  -- full MatchDto (lobby data), NOT exposed to anon
  fetched_at    timestamptz not null default now()
);

create table player_matches (                    -- my participant row, normalized + derived
  match_id          text not null references matches(match_id) on delete cascade,
  puuid             text not null references riot_accounts(puuid),
  game_datetime     timestamptz not null,        -- denormalized for sorting
  queue_id          int not null,
  set_number        smallint not null,
  placement         smallint not null check (placement between 1 and 8),
  level             smallint,
  last_round        smallint,
  gold_left         smallint,
  damage_to_players int,
  time_eliminated_s real,
  traits            jsonb not null,              -- active only: [{name,num_units,style,tier_current,tier_total}]
  units             jsonb not null,              -- [{character_id,star,items[]}]
  carry_unit        text,
  primary_traits    text[] not null default '{}',
  comp_key          text,                        -- signature, see §6
  derived_version   smallint not null default 1, -- bump → scripts/rederive.ts recomputes from raw
  primary key (match_id, puuid)
);
create index on player_matches (puuid, game_datetime desc);

create table sync_state (
  puuid            text primary key references riot_accounts(puuid),
  status           sync_status not null default 'idle',
  lock_until       timestamptz,
  next_allowed_at  timestamptz,                  -- cooldown / Retry-After gate
  last_started_at  timestamptz,
  last_success_at  timestamptz,
  last_error       text,
  last_call_count  smallint,
  last_rate_limit  jsonb                         -- parsed X-App/Method-Rate-Limit(-Count) headers
);
```

### 4.5 Sync lock RPC (atomic, cross-instance)
```sql
create function acquire_sync_lock(p_puuid text, p_lock_s int default 90)
returns setof sync_state language sql as $$
  update sync_state
     set status = 'running',
         lock_until = now() + make_interval(secs => p_lock_s),
         last_started_at = now()
   where puuid = p_puuid
     and (lock_until is null or lock_until < now())
     and (next_allowed_at is null or next_allowed_at <= now())
  returning *;
$$;
revoke execute on function acquire_sync_lock from public, anon, authenticated;
```

Zero rows returned means the sync is skipped (already running or on cooldown). If an instance crashes, the lock expires on its own after `p_lock_s`. In the migration, the function is defined with `set search_path = ''` and fully qualified names.

### 4.6 RLS & access
- RLS is **enabled on every table**.
- Anon `select using (true)` on: `tft_sets, traits, champions, items, tier_lists, tier_entries, comps (is_published), comp_units, riot_accounts, rank_snapshots, player_matches`.
- **No anon policy** on `matches` (its `raw` column holds other players' lobby data) or on `sync_state`. The server reads these with the service role.
- No insert/update/delete policies at all. Every write goes through `src/lib/supabase/admin.ts` (service role, `server-only`) or local scripts.

### 4.7 Implementation notes (Phase 1)
- **Migration:** `supabase/migrations/20260911120000_init.sql`. The Supabase CLI requires `<timestamp>_name.sql` filenames.
- **Explicit privileges:**
  - `revoke all … from anon, authenticated`, then `grant select` on the public tables only.
  - `grant all … to service_role`.
  - Access doesn't depend on project-level default privileges. **Every future table must repeat this pattern plus RLS.**
- **Additions beyond §4.3/§4.4:**
  - `unique (tier_list_id, champion_api_name)` and `unique (tier_list_id, item_api_name)` on `tier_entries`, so an entity appears at most once per list.
  - `set_updated_at()` triggers on `tier_lists`, `comps` and `riot_accounts`.
- **Verified** on real Postgres 17 via PGlite (32 checks): every constraint, RLS as anon and authenticated, denied access to `matches`/`sync_state`/RPC, service-role writes, and lock acquire/refuse/cooldown/expiry.
- **Types:** `src/lib/supabase/types.ts` is generated from the linked project by `pnpm db:types`. Never edit it by hand; rerun it after every migration push.

---

## 5. Riot API service design

### 5.1 Endpoints used
| Purpose | Endpoint | Host routing | Calls |
|---|---|---|---|
| Riot ID → puuid (setup only) | `/riot/account/v1/accounts/by-riot-id/{name}/{tag}` | account region (americas/asia/europe) | 1× ever |
| Profile icon/level | `/tft/summoner/v1/summoners/by-puuid/{puuid}` | platform (na1, th2…) | ≤1/day |
| Recent match IDs | `/tft/match/v1/matches/by-puuid/{puuid}/ids?start=0&count=20` | match region (americas/asia/europe/sea) | 1/sync |
| Match detail | `/tft/match/v1/matches/{matchId}` | match region | only **new** IDs |
| Rank/LP | `/tft/league/v1/by-puuid/{puuid}` | platform | 1/sync |

`routing.ts` derives both regions from `RIOT_PLATFORM` alone. For example `na1/br1/la1/la2 → americas`, `euw1/eun1/tr1/ru → europe`, `kr/jp1 → asia`, `oc1/ph2/sg2/th2/tw2/vn2 → sea` (match) and `asia` (account). **TODO (Phase 4):** check this table against Riot's current docs.

### 5.2 Rate-limit safety (defense in depth)
| Layer | Mechanism | Guarantee |
|---|---|---|
| 1. Cache-first | Match details are immutable, so an ID already in `matches` is never refetched | Steady state is **2 calls per sync** (ids + league) |
| 2. Per-sync budget | Hard cap of **25 calls per sync run**; new matches capped at 20 | One sync can never exceed 25 |
| 3. Global gate | `acquire_sync_lock` + `next_allowed_at = now() + 120s` cooldown | At most one sync per 2 min across all Vercel instances, so **≤25 calls per 2 min** (limit is 100) |
| 4. In-process limiter | Dual sliding window at conservative budgets (**15/1s, 80/120s**), concurrency 3 | Spike-safe even inside one run (limit is 20/1s) |
| 5. 429 handling | Read `Retry-After`. If ≤3s and the budget allows, retry once. Otherwise stop, keep partial progress (each match commits individually), set `status='rate_limited'` and `next_allowed_at = now()+Retry-After` | No retry storms in serverless |
| 6. Observability | Parse `X-App-Rate-Limit-Count` / `X-Method-Rate-Limit-Count` into `sync_state.last_rate_limit`; log call count | Headroom is visible on the dashboard |
| 7. Auth errors | 401/403 → `status='error'` with the message "Riot key invalid/expired"; the UI shows a banner; cached data is still served | Dev-key expiry never breaks the page |

> **Key note:** a Riot **Development key expires every 24h**, so the daily cron would fail unless you renew it. The recommendation is to apply for a free **Personal API Key** at developer.riotgames.com. It has the same limits and doesn't expire. The design works with either key.

### 5.3 Sync algorithm (`SyncService.syncPlayer`)
```
syncPlayer(puuid, trigger: 'cron' | 'manual' | 'stale-read'):
  row = rpc acquire_sync_lock(puuid)            → none? return { skipped, nextAllowedAt }
  try
    ids     = GET match ids (count=20)          # 1 call
    missing = ids − (select match_id from matches where match_id = any(ids))
    for id in missing (limiter, concurrency 3):
      dto = GET match(id) → Zod-parse subset (passthrough keeps raw)
      tx: upsert matches(raw) + player_matches(derive(dto, puuid))
    league = GET league by puuid → insert rank_snapshot if tier/LP changed   # 1 call
    if trigger='cron': GET summoner → update riot_accounts               # ≤1 call/day
    set status='ok', last_success_at=now(), next_allowed_at=now()+120s, last_call_count
  catch RateLimited(retryAfter) → status='rate_limited', next_allowed_at=now()+retryAfter
  catch AuthError               → status='error', last_error
  finally lock_until = null
```

**Triggers**, all through the same gate:
- `GET /api/cron/sync` runs daily through Vercel Cron and requires `Authorization: Bearer ${CRON_SECRET}`.
- `refreshMyMatches()` is a Server Action behind the dashboard's refresh button. It's public, but the cooldown bounds it, and the UI shows a countdown.
- Stale-on-read: when `/me` loads and `last_success_at` is more than 10 min old, it schedules a sync with `after()`. The page renders cached data immediately.
- `scripts/riot-backfill.ts` runs locally with the same client and limiter and uses `start` offsets for deeper history.

A typical sync is ~2–22 calls and ~2–4 s, well inside Vercel function limits.

---

## 6. Derivation & stats contracts

### 6.1 Riot DTO subset (Zod, `.passthrough()`)
```ts
MatchDto   = { metadata: { match_id: string; participants: string[] },
               info: { game_datetime: number /*ms*/; game_length: number /*s*/; game_version: string;
                       queue_id: number; tft_set_number: number; tft_game_type?: string;
                       participants: ParticipantDto[] } }
ParticipantDto = { puuid: string; placement: number; level: number; last_round: number; gold_left: number;
                   time_eliminated: number; total_damage_to_players: number;
                   traits: { name: string; num_units: number; style: number; tier_current: number; tier_total: number }[];
                   units:  { character_id: string; itemNames: string[]; tier: number /*stars*/; rarity: number }[] }
```
- Unit cost comes from a join to `champions.cost`. The API's `rarity` codes aren't used.
- Augments aren't reliably present in the TFT match API, so nothing depends on them.

### 6.2 Comp signature v1 (`comp-signature.ts`, pure, versioned)
1. Active traits are those with `style ≥ 1`, excluding unique traits (`tier_total = 1`). Sort by `style` desc, then `num_units` desc. The top 2 become `primary_traits`.
2. The carry is the unit with the most items, tie-broken by stars desc, then cost desc.
3. `comp_key = carry + '|' + sorted(primary_traits).join('+')`. The display label is "Trait1 Trait2 · CarryName", resolved from static tables.
4. *(Phase 5 option)* Match against a curated comp when ≥60% of the comp's core units are present, which enables "your results on curated comps".

Changing the algorithm means bumping `derived_version` and running `scripts/rederive.ts`. It recomputes from `matches.raw` with 0 API calls.

### 6.3 Stats (`src/lib/stats`, pure TS over ≤N cached rows, computed on read)
```ts
type StatsFilter   = { lastN: 10 | 20 | 50; queues: 'ranked' | 'all'; currentSetOnly: boolean };
type PlayerSummary = { games: number; avgPlacement: number; top4Rate: number; winRate: number;
                       avgLevel: number; placementDist: number[/*8*/]; recent: number[/*placements, newest first*/] };
type CompStat      = { compKey: string; label: string; games: number; avgPlacement: number; top4Rate: number };
type UnitStat      = { apiName: string; games: number; avgPlacement: number };   // also used for items
```
Computing on read is sub-millisecond over 20–50 rows and never goes stale. Raw data is the only thing cached.

---

## 7. Curated seed format (YAML → Zod → upsert)

```yaml
# data/curated/<setId>/comps/jinx-snipers.yaml   (illustrative)
slug: jinx-snipers
name: Jinx Snipers
tier: S
style: fast8
difficulty: 2
patch: "xx.y"
summary: Stable top-4 fast 8 into 2★ Jinx.
early_units: [TFTxx_UnitA, TFTxx_UnitB]
board:
  - { unit: TFTxx_Jinx,  row: 3, col: 0, star: 2, carry: true, items: [TFT_Item_GuinsoosRageblade, TFT_Item_InfinityEdge, TFT_Item_LastWhisper] }
  - { unit: TFTxx_Tank1, row: 0, col: 3, star: 2, items: [TFT_Item_WarmogsArmor] }
guide: |
  **Early:** ... **Mid:** ... **Positioning:** ...
```

```yaml
# data/curated/<setId>/champion-tiers.yaml
slug: champions-xx.y
kind: champion
patch: "xx.y"
current: true
tiers:
  S: [TFTxx_Jinx, TFTxx_UnitC]
  A: [ ... ]
notes: { TFTxx_Jinx: "Best 4-cost carry this patch" }
```

**Seed script steps:**
1. Parse the YAML and validate it with Zod.
2. Check every `api_name` against the static tables. Any bad reference fails the run, with the file and path in the error.
3. Upsert in one transaction, replacing each comp's `comp_units`.
4. Unpublish comps whose YAML was removed.
5. `POST /api/revalidate` to bust the cache tags.

---

## 8. Rendering & caching in Next.js
- **Cache Components (`cacheComponents: true`)** is how tag-based caching is done in Next 16:
  - Uncached data and request-time `params` must render inside `<Suspense>`. The static shell prerenders and the rest streams in. `/comps/[slug]` is already Partial Prerender.
  - Client components using `usePathname` (the nav) sit in a Suspense boundary. Without it, dynamic routes fail the build.
- **Curated/static pages** (`/comps`, `/tiers/*`) are Server Components.
  - Query functions use `'use cache'` + `cacheTag('comps' | 'tiers' | 'static')` + `cacheLife`.
  - `/api/revalidate` calls `revalidateTag(tag, …)` after seeding. In Next 16 it takes a cache-life profile as its second argument; check the bundled docs in Phase 2.
- **`/me` and `/`** are dynamic but read only from Supabase. Each view is one query to `player_matches` plus the latest `rank_snapshots` and `sync_state`. Riot is never called during render.
- Icons come from CommunityDragon URLs via `next/image` `remotePatterns`. They can be mirrored to Supabase Storage later if needed.

---

## 9. UI system (dark, dense, scannable)
- **Palette:** background `zinc-950`, panels `zinc-900`, 1px `zinc-800` borders, text `zinc-100`/`zinc-400`. Base text is 13px. Numbers use `tabular-nums`.
- **Semantic colors:**
  - Cost borders: 1 gray, 2 green, 3 blue, 4 purple, 5 gold.
  - Tier badges: S rose, A orange, B amber, C lime.
  - Placement pills: 1st gold, 2–4 teal, 5–8 muted.
  - Trait styles: bronze, silver, gold, prismatic.
- **Layout:**
  - A single top nav: Overview · Comps · Champions · Items · Me.
  - Keyboard shortcuts `1–5` switch pages and `/` focuses search.
  - Optimized for a half-width 1080p window (~960px) that also degrades to phone width.
- **Key components:**
  - `ChampionIcon`: cost border, star pips, mini item icons.
  - `TraitBadge`: style color and count.
  - `TierRow`: tier label plus a wrapping icon row.
  - `HexBoard`: 4×7 with odd rows offset.
  - `PlacementPill`, `StatTile`, `Sparkline`.
- **States:** skeletons while loading, empty states ("No ranked games this set"), and a sync status badge ("synced 3m ago", "cooldown 1:12", "key expired").

---

## 10. Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Read client (anon/publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Writes, sync, private tables |
| `RIOT_API_KEY` | server | Riot API |
| `RIOT_GAME_NAME`, `RIOT_TAG_LINE`, `RIOT_PLATFORM` | server | Your account; regions are derived from the platform |
| `CRON_SECRET` | server | Vercel Cron auth |
| `REVALIDATE_SECRET` | server | Seed script → cache revalidation |

`src/lib/env.ts` validates **per scope**: `supabasePublicEnv()`, `supabaseAdminEnv()`, `riotEnv()` and `secretsEnv()`. Each is lazy and memoized, so a consumer only needs its own variables. Error messages name the variable but never echo its value. The public and admin scopes also reject **swapped keys**: an anon/publishable key in `SUPABASE_SERVICE_ROLE_KEY`, or a service/secret key in the public anon variable.

**Scripts and `server-only`:** `admin.ts` imports `server-only`, which throws under plain Node. Phase 2 scripts should run with `tsx --conditions=react-server`, or build their own client.

---

## 11. Open items to verify during implementation
- [ ] Riot platform → region routing table (§5.1), checked against current Riot docs (Phase 4).
- [ ] Confirm `th2` is still your account's live platform. Riot has been consolidating SEA shards. In Phase 4, `riot-setup.ts` should ask Riot's account-region lookup (`/riot/account/v1/region/by-game/tft/by-puuid/{puuid}`) instead of trusting `RIOT_PLATFORM`.
- [x] After `supabase link`: regenerate `types.ts` with `pnpm db:types`. The hand-written version was overwritten before the first commit, so no diff was possible. `pnpm check` and `pnpm build` pass against the generated types.
- [ ] `tft/league/v1/by-puuid` availability for your platform. The fallback is the summoner-id-based entries endpoint (Phase 4).
- [ ] CommunityDragon icon path conversion (`.tex` → `.png` URL rule) and the current-set key (Phase 2).
- [ ] Confirm Vercel Hobby function duration and cron limits at deploy time (Phase 1/4).
