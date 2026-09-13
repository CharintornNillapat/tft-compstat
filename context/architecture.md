# TFT CompStat — Architecture

> **Status:** Approved design (2026-09-11). Phases 1–5 are implemented and deployed (2026-09-12). Their decisions are recorded below (§4.7–§4.9, §5, §6, §7, §8, §9), with the deployment regions in §12. This is the source of truth for implementation. Update it whenever a phase changes a decision.
> **Operations:** day-to-day runbook in [`../README.md`](../README.md) — seeding, cron verification, key rotation, troubleshooting.
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
| Static game data | CommunityDragon `cdragon/tft/en_us.json`; Riot Data Dragon `tft-champion.json` | CommunityDragon: champion, trait and item names, costs, breakpoints, icons. Data Dragon: which units are in the shop (§4.8) |
| Charts | Inline SVG (sparkline, placement histogram) | No chart library needed at this scale |
| Tests | Vitest | Pure functions: limiter, header parsing, comp signature, stats, seed schemas |
| Tooling | pnpm 12, ESLint 9 (flat config), Supabase CLI as a devDependency, `tsx` for scripts | Bundled Next docs live in `node_modules/next/dist/docs/`. Check them before using a Next API (see `AGENTS.md`). |
| Hosting | Vercel (Hobby, `icn1`) + Supabase (Free, `ap-northeast-2`) | Hobby cron runs once a day. The daily sync also stops the Supabase free tier from auto-pausing. **Functions and the database sit in the same AWS region on purpose** — see §12. |

---

## 3. Directory layout (target)

```
context/                     architecture.md, roadmap.md (kept current each phase)
data/curated/<setId>/
  champion-tiers.yaml
  item-tiers.yaml
  comps/<slug>.yaml
  meta-notes.yaml            the patch brief on /; read at build time, never seeded (§7)
  openers.yaml               stage-2 opener boards on /; read at build time, never seeded (§7)
  champion-bis.yaml          champion item builds for /bis; GENERATED by sync:bis (§7.4)
  augment-tiers.yaml         augments for /augments and the comp pages; GENERATED by sync:meta (§7.5)
scripts/
  sync-static.ts             CommunityDragon → tft_sets/champions/traits/items (+ revalidate "static")
  seed-curated.ts            YAML → tier_lists/tier_entries/comps/comp_units (+ revalidate)
  sync-bis.ts                MetaTFT unit_detail → champion-bis.yaml (§7.4)
  sync-meta.ts               MetaTFT ranked stats → the two tier-list YAML files (§7.1)
                             and the generated comps in comps/ (§7.2), and augment-tiers.yaml (§7.5)
  riot-setup.ts              Riot ID → puuid; probes routing/league (§5.1); seeds riot_accounts + sync_state;
                             `--fixture` saves an anonymized real match for the derivation tests
  riot-sync.ts               one sync locally, through SyncService (lock, cooldown, budget)
  riot-backfill.ts           deeper history, run locally, same limiter; bypasses the lock on purpose
  rederive.ts                recompute player_matches from matches.raw (0 API calls)
  lib/{db,revalidate}.ts     paging/chunking helpers; POST /api/revalidate client
  lib/meta-feed.ts           MetaTFT HTTP: the stat feed (§7.1), the comps feed (§7.2), augment grades (§7.5)
                             and the trait-type lookup sync-static reads (§4.8)
  lib/references.ts          the static tables curated scripts check api names against (one read)
supabase/migrations/         SQL (schema, RLS, RPCs)
src/app/
  page.tsx                   Overview (glance panel)
  bis/page.tsx               Champion item builds
  augments/page.tsx          Augment tier list
  comps/page.tsx, comps/[slug]/page.tsx
  tiers/champions/page.tsx, tiers/items/page.tsx
  me/page.tsx                Personal dashboard
  api/cron/sync/route.ts, api/revalidate/route.ts
src/components/              ChampionIcon, ItemIcon, TraitHex (trait-badge.tsx), TierRow, CostFilter, ToggleGroup, HoverTip,
                             HexBoard, CompList, CompGuide, CompTraitList, GuideMarkdown, CarryMark (comp-details.tsx),
                             PlaystyleBadge, DifficultyBadge, ContestedBadge (comp-badges.tsx),
                             AugmentBoard, RarityPill, AugmentFace, AugmentDetails (augment-parts.tsx),
                             PlacementPill, StatTile, Sparkline, PlacementHistogram, Segmented, Skeleton, SyncNotice,
                             MeDashboard, MeMatchHistory, MeFavoriteComps, CarryCell (me-comp-cell.tsx),
                             Shortcuts, and the pure helpers placement-styles.ts, sparkline-geometry.ts, shortcut-match.ts
src/lib/
  env.ts                     Zod-validated env
  cache-tags.ts              the cache tags /api/revalidate accepts
  supabase/{server,admin,types,result}.ts   admin = service role, `import 'server-only'`; result = `must()`
  static/game.ts             client-safe game constants (tiers, costs, trait styles, item kinds, queue ids)
  static/cdragon.ts          pure CommunityDragon → rows transform
  static/trait-text.ts       pure: trait markup + hashed variables → plain text (§4.8)
  static/names.ts            NameBook: api name → display name/icon/cost (pure, client-safe) + pickNames
  static/lookup.ts           getStaticNames(): the whole NameBook, `use cache` + cacheTag("static")
  riot/{routing,client,limiter,headers,errors,schemas,endpoints}.ts
  sync/{sync-service,derive,comp-signature,patches,actions,notice}.ts
  sync/__fixtures__/match.json   a real Set 18 match, puuids anonymized
  stats/{types,row,filter,summary,comps,champions,rank}.ts  pure functions
  stats/queries.ts           uncached reads for /me and / (anon client)
  curated/{schemas,validate,queries}.ts
  curated/curated-files.ts   reads the two never-seeded YAML files from the newest set folder
  curated/meta-brief.ts      pure parse + cached read of meta-notes.yaml (§8)
  curated/openers.ts         pure validate + cached read of openers.yaml, against the static tables (§8)
  curated/bis.ts             pure validate + cached read of champion-bis.yaml (§8)
  curated/bis-sync.ts        pure: unit builds → best-in-slot, role, YAML text (§7.4)
  curated/augment-sync.ts    pure: augment grades → tiers, rarity, per-comp picks, YAML text (§7.5)
  curated/augment-tiers.ts   pure parse of augment-tiers.yaml, shared by the site and sync:meta (§7.5)
  curated/augments.ts        cached read of augment-tiers.yaml (§8)
  curated/meta-sync.ts       pure: placement histogram → tier bands → tier-list YAML text (§7.1)
  curated/comp-sync.ts       pure: comp feed rows → board, carries, style → comp YAML text (§7.2)
  curated/traits.ts          computeActiveTraits (pure, client-safe)
  curated/trait-details.ts   trait tooltip data: tiers with text, member champions (pure, client-safe)
  curated/comp-badges.ts     Contested / difficulty / playstyle rules (pure, client-safe)
  curated/comp-filter.ts     /comps tier/style/search filter (pure, client-safe)
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
  patch      text,                               -- game-data version of the last sync, '16.18' (not the TFT patch label, see §4.8)
  is_active  boolean not null default false
);
create unique index one_active_set on tft_sets (is_active) where is_active;

create table traits (
  api_name    text primary key,                  -- matches Riot traits[].name
  set_id      smallint not null references tft_sets(id),
  name        text not null,
  breakpoints jsonb not null,                    -- [{ "min": 2, "style": "bronze" }, ...] sorted by min (§4.8)
  icon_url    text,
  description text,                              -- general text, placeholders resolved (§4.8, Phase 6 Task 8)
  effects     jsonb not null default '[]',       -- [{ "min": 2, "text": "20% AD" }, ...] per-breakpoint text
  kind        text check (kind in ('origin','class','unique'))  -- tooltip subtitle, from MetaTFT's lookup (§4.8, Task 9)
);

create table champions (
  api_name     text primary key,                 -- 'TFTxx_Jinx' = Riot units[].character_id
  set_id       smallint not null references tft_sets(id),
  name         text not null,
  cost         smallint not null check (cost between 1 and 5),  -- playable units only; summons filtered out
  traits       text[] not null default '{}',     -- trait api_names
  icon_url     text,
  is_shop_unit boolean not null default true     -- false = playable but unbuyable (Riftbeasts); §4.8
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

### 4.8 Static data sync (Phase 2)
`scripts/sync-static.ts` (`pnpm sync:static [--set N] [--dry-run]`) wraps the pure transform in `src/lib/static/cdragon.ts`. Phase 2 needed no schema change.

**Sources**
- The version comes from CommunityDragon `latest/content-metadata.json` (`16.18.…` → `16.18`). The sync then fetches `cdragon/tft/en_us.json` from that **pinned** directory, the same one the icon URLs use.
- The set is the newest *standard* one, whose mutator is exactly `TFTSet<N>` (not `_PAIRS`, `_TURBO`, `_PVEMODE` or events). `--set N` overrides it.
- Display names come from a small map in `cdragon.ts`. CommunityDragon's names are internal: Set 18 ships as "Set10".

**Versions:** TFT patch labels are per set since Set 17 (17.1 on 2026-04-15, 18.1 on 2026-08-26, 18.2 on 2026-09-10). The client data version is separate (16.18 = TFT 18.2). `tft_sets.patch` stores the data version. Curated YAML carries the TFT label shown on the site.

**Champions**
- A **playable** unit has a cost of 1–5 and at least one trait. That test alone excludes the junk: legacy `TFT_*` summons carry no traits, and the anvils have cost 8 or 11.
- Riot's Data Dragon `tft-champion.json` (preferring the release matching the data version) then sets **`is_shop_unit`**, rather than filtering. Units it omits are stored with `is_shop_unit = false`: in Set 18 those are exactly the ten Riftbeast units, all of which carry the `Riftbeast` trait — Pebbles (`DA_18_Sentry`), Cinderling, Gromp, Murkwolf, Scuttlecrab, Krug, Mama Beak (`DA_CrimsonRaptor18`), Sentinel, Brambleback and Elder Dragon.
  - Why a flag and not a filter (Phase 4): these are real board units that meta comps field, so curated comps must be able to reference them and match derivation must resolve their `character_id` to a cost. The flag keeps shop and non-shop distinguishable instead of discarding the distinction.
  - Migration `20260912120000_champion_shop_flag.sql`. Set 18 went from 64 to 74 champions.
- If Data Dragon lists no units for the set, every unit is marked as a shop unit and the sync warns. Unreachable Data Dragon does the same, silently.
- Element variants such as the nine Set 18 Lux forms stay as separate rows, because match data names them.
- Champion `traits` in CommunityDragon are display names. They're mapped to trait api names within the set. When a name is shared (Set 17 has 8 "Stargazer" variants), the shortest api name wins and the sync warns.
- `icon_url` uses `tileIcon` (128px face crop), falling back to `squareIcon`, then `icon`.

**Traits**
- Every trait of the set is stored, so emblems and match data always resolve.
- `breakpoints` stores **style names**, because CommunityDragon and Riot's match API number styles differently. CommunityDragon codes map as 1 bronze, 3 silver, 4 unique, 5 gold, 6 prismatic; other codes don't occur.
- Effects without a unit count are dropped. When a count repeats, the lowest style is kept.
- Phase 4 maps Riot's match-API `style` onto the same names.
- **Text** (Phase 6 Task 8, migration `20260913120000_trait_descriptions.sql`). `desc` is client markup: a `<row>` per breakpoint, `<br>`, keyword tags, `%i:scaleAS%` stat icons and `@Var@` / `@Var*100@` placeholders. `trait-text.ts` turns it into `description` (the text outside the rows) and `effects` (one `{min, text}` per kept breakpoint, with the "(3)" prefix dropped because the tooltip draws the count itself).
  - **Most variables ship hashed** (`{a9a813e7}`): the client keeps only a hash of the bin name, FNV-1a 32 over the **lowercased** name. `binHash` reproduces it, which resolves all 239 Set 18 placeholders — including Rapidfire's `@ASPerAttack@`, whose named key is spelled `ASperAttack`. Anything still unresolved prints `?`, visibly, rather than a blank.
  - The n-th `<row>` belongs to the n-th effect with a unit count, which holds for every Set 18 trait. Where a count repeats, the text follows the effect `traitBreakpoints` kept, so a tier's text and its colour agree.
  - Stat icons become words (`AD`, `Attack Speed`, `Durability`) and scaled values lose float noise (`0.10000000149 × 100` → `10`).
- **Type** (Phase 6 Task 9, migration `20260913180000_trait_kind.sql`). Neither CommunityDragon nor Data Dragon says whether a trait is an origin or a class, so `kind` comes from MetaTFT's per-set lookup, `data.metatft.com/lookups/TFTSet<N>_latest_en_us.json` (`traits[].type`, with `_metadata.set` checked) — the only MetaTFT file `sync:static` reads. Set 18: origin 14 · class 12 · unique 10, all 36 matched.
  - When the lookup is unreachable the rows **omit** `kind` rather than send null, so the upsert keeps what an earlier sync stored; a trait the lookup lacks gets null and one warning for all of them.
  - The file's `_metadata.patch` reads `pbe` even at the `latest` path. Trait types do not change within a set, so that is accepted rather than guarded.

**Items**
- The sync stores every entry in the set's pool (`setData[].items`), so curated lists and match data can reference any of them.
- `kind` comes from hashed CommunityDragon tags first: `component`, `{7ea41d13}` completed, `{6ef5c598}` radiant, `{44ace175}` artifact, `{27557a09}` support, `{ebcd1bac}` emblem. Fallbacks: "Radiant" or "Artifact"/"_Item_Ornn" in the api name, then a two-component recipe means completed. Everything else is `other`.
- Emblems are recognized by that tag or by a name of the form "<Trait> Emblem". `grants_trait` comes from the name, because `associatedTraits` is empty.
- Names drop client markup (`<rules>…</rules>`). An empty name falls back to the api name.
- Items that leave the pool keep their rows with `is_active = false`.
- **Set 18 lists most items twice:** `DA_…` (the Enchanted Wilds versions, built from `DA_Component_*`) and the older `TFT_Item_…`. Both are stored; which one match data uses is a Phase 4 check (§11).

**Icons:** `https://raw.communitydragon.org/<version>/game/<path lowercased, .tex → .png>`. CommunityDragon keeps old version directories (checked back to 13.1), so a stored URL keeps pointing at the synced file.

**Writes**
- The writes are idempotent upserts in FK order: set, traits, champions, items (in batches of 500).
- The old active set is cleared before the new one is set.
- Reads page past PostgREST's 1000-row cap.
- A failed run is fixed by re-running it.

### 4.9 Curated comps (Phase 3)
- **Migration:** `supabase/migrations/20260911180000_seed_comp.sql` adds one function and no tables.
- **`seed_comp(p_comp jsonb, p_units jsonb) → uuid`** writes one comp in a single transaction. It upserts `comps` by slug, deletes the comp's `comp_units` and inserts the new ones.
  - Why an RPC instead of making `unique (comp_id, hex_row, hex_col)` `DEFERRABLE`: supabase-js has no transactions, so a deferrable constraint wouldn't help across separate calls. The RPC also means readers never see a comp with half its units.
  - Like `acquire_sync_lock`, it uses `set search_path = ''` and qualified names, and only `service_role` may execute it.
  - Verified on Postgres 17 via PGlite (16 checks):
    - insert with defaults
    - a re-seed keeps the id and swaps two units' hexes
    - a removed unit is pruned
    - an unknown champion or a double-booked hex rolls back the whole call
    - `anon`/`authenticated` are denied
    - RLS still hides unpublished comps and their units
- **Unpublishing:** comps whose YAML file was removed get `is_published = false`. The row stays as history, and RLS hides it and its units from `anon`.
- **Active traits** (`src/lib/curated/traits.ts`, `computeActiveTraits`) are computed on read and never stored:
  - Each champion counts once per trait, even when it's fielded twice.
  - An emblem adds its trait (`items.grants_trait`) to its holder. One the unit already has adds nothing, and the seed rejects that case.
  - `level` is the number of breakpoints reached (Riot's `tier_current`), and `style` is the style of the highest breakpoint reached.
  - Display order: prismatic, gold, silver, bronze, then unique, then inactive traits. Within a style, higher counts come first, then names alphabetically.
- **Which comps are shown:** `/comps` lists the published comps of the **active set**. `/comps/[slug]` shows any published comp.

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

`routing.ts` derives both regions from `RIOT_PLATFORM` alone: `na1/br1/la1/la2 → americas`, `euw1/eun1/me1/tr1/ru → europe`, `kr/jp1 → asia`, `oc1/ph2/sg2/th2/tw2/vn2 → sea` (match) and `asia` (account, which has no `sea` host).

**Verified live 2026-09-12** (`pnpm riot:setup`), because Riot's own docs disagree about the SEA shards:
- **The account is on `sg2`, not `th2`.** `/riot/account/v1/region/by-game/tft/by-puuid` reports `sg2`, and `th2.api.riotgames.com` does not resolve at all — Riot has consolidated the shard. `RIOT_PLATFORM` is therefore `sg2`.
- `sg2 → sea` for match-v1 is confirmed: `sea` returns the 20 ids, and `americas`/`europe`/`asia` each answer **`200 []`**. A wrong-shard host does not 404, so "the host answered" proves nothing — only a non-empty result identifies the real shard, and `riot-setup.ts` probes all four accordingly.
- `tft/summoner/v1` and `tft/league/v1/by-puuid` both work on the `sg2` platform host, so the summoner-id fallback §11 held in reserve is not needed.

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
- **Set 18 match data carries no `augments` field at all** (checked on the fixture, Phase 6 Task 10), so nothing here depends on them, and the augment tier list cannot be measured either (§7.5).
- `queue_id` is accepted as either `queue_id` or `queueId`, since Riot has shipped both spellings.

**Verified against a real Set 18 match** (`SG2_173695822`, 2026-09-12) — the §11 questions:
- `tft_set_number` is `18`, and `queue_id` `1100` with `tft_game_type: "standard"`, as expected.
- **`game_version` is the literal string `"TFT Unreal Version ?.?.?.?"`** — the Unreal move stripped the numbers, so `matches.patch` **cannot** be derived from it. It's derived from `game_datetime` against the patch release dates instead (§6.4).
- **`units[].character_id` and `itemNames[]` use the `DA_…` names**, matching the `champions` and `items` rows. Across the whole lobby: 44 distinct units, 39 items and 31 traits, **all resolved, none unknown**; every item name was `DA_*` and none was `TFT_Item_*`.
- That lobby fielded **five Riftbeast units** (three on the tracked player's own board), so the §11 pre-requisite was load-bearing: without it, derivation could not have costed them.
- **Trait styles: use `tier_current`, not Riot's `style`.** `tier_total` equalled the stored `breakpoints` length for all 11 traits sampled, and `tier_current` indexes those breakpoints exactly (Hunter at 3 units → `tier_current: 2` → `breakpoints[1]` = silver). Riot's `style` is ambiguous — it reported `3` for the *unique* traits (`tier_total: 1`), while `3` is gold in its usual 1/2/3/4 scheme, and no gold or prismatic trait appeared to disambiguate. Reading the style from our own breakpoints also means a match's traits and a curated comp's traits can never disagree, since `computeActiveTraits` uses the same table. Riot's code is kept only as a fallback for a trait missing from `traits`.

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
                       avgLevel: number; placementDist: PlacementDist; recent: number[/*newest first*/] };
type CompStat      = { compKey: string; label: string; games: number; avgPlacement: number; top4Rate: number };
type UnitStat      = { apiName: string; games: number; avgPlacement: number };   // also used for items
```
Computing on read is sub-millisecond over 20–50 rows and never goes stale. Raw data is the only thing cached.

**Implementation notes (Phase 5).**
- **`MatchRow`** (`stats/types.ts`) is a trimmed projection of `player_matches`: `gold_left`,
  `damage_to_players`, `time_eliminated_s`, `last_round`, `puuid` and `derived_version` are dropped
  because nothing renders them. It keeps the client payload small **and** decouples the stats
  modules from the generated Supabase types, so every test builds its input as a plain object.
  `toMatchRow` re-narrows the `traits`/`units` jsonb the same way `derive.ts` casts it on the way in.
- **`PlacementDist` is a fixed-length 8-tuple**, not `number[]`: under `noUncheckedIndexedAccess`
  that makes `dist[0]` a `number` rather than `number | undefined` at every call site.
- **Filter order: predicates, then `lastN`.** `selectMatches` applies the queue and set predicates
  first, so "last 50, ranked" means up to 50 *ranked* games, not the ranked subset of the last 50.
  `PlayerSummary.games` carries the real count, and the UI prints that rather than the number asked
  for. `currentSet` is passed in from `tft_sets.is_active`, never derived as `max(set_number)` —
  right after a set rollover with no games played the max is the *old* set, and "current set only"
  would quietly show last set's games.
- **Champions and items count once per match** (`topChampions`/`topItems`), deduplicated per row.
  Two Deathblades, or the same champion fielded twice, count once — mirroring `computeActiveTraits`'
  once-per-trait rule. That is what makes `games` mean "matches where I fielded X" and leaves
  `avgPlacement` well defined.
- **Labels** come from `signatureLabel` (§6.2) through `labelNames(book)`, so a match row and a
  curated comp are named by the same code. Trait *display* names come from `matchTraits`, because
  `player_matches.traits[].name` is an api name and `TraitHex` wants a display name.
- **Where the filter runs:** `/me` fetches ≤50 rows once on the server and hands plain props to a
  client component, which re-runs these same pure functions on every toggle. Switching 10/20/50 or
  ranked/all therefore costs no round trip. Driving it from `searchParams` instead would make every
  toggle a full RSC navigation for a subset of data the browser already holds.
- **Name resolution:** `getStaticNames()` caches the whole api-name dictionary under the `static`
  tag, and `pickNames` trims it to what the fetched rows reference before it crosses to the client —
  measured at 135 names rather than the 881 rows in the full tables.

### 6.4 Patch labels (`matches.patch`)
Set 18 broke the old approach: `game_version` no longer carries a number (§6.1). `patch` is therefore derived from `game_datetime` against a table of TFT patch release dates in `src/lib/sync/patches.ts`, the same labels the curated YAML uses:

| Set | Patch | Released |
|---|---|---|
| 17 | 17.1 | 2026-04-15 |
| 18 | 18.1 | 2026-08-26 |
| 18 | 18.2 | 2026-09-10 |

The match's own `tft_set_number` picks the set, then the latest release at or before `game_datetime` gives the label. A match older or newer than anything known falls back to `"<set>.?"`, which is honest rather than wrong and is easy to grep for. **The table needs a line per patch**; a missed one mislabels matches but breaks nothing, and `scripts/rederive.ts` fixes them from `matches.raw` with 0 API calls.

---

## 7. Curated seed format (YAML → Zod → upsert)

```yaml
# data/curated/<setId>/comps/<slug>.yaml   (one comp per file; see data/curated/18/comps/)
slug: draven-fast-9           # = file name and URL (/comps/draven-fast-9); lowercase words joined by "-"
name: Draven Fast 9
tier: S                       # S/A/B/C
style: fast9                  # fast8, fast9, reroll_1, reroll_2, reroll_3, flex
difficulty: 3                 # optional: 1 easy, 2 medium, 3 hard
patch: "18.2"                 # TFT patch label, quoted
order: 1                      # optional: order within its tier on /comps (then by name); default 0
published: true               # optional: false hides it but keeps the row; default true
summary: One-line pitch.      # optional, shown in the list
gem: true                     # optional: sleeper pick -> "Gem" badge; default false
avg_place: 4.32               # optional, 1-8
top4_rate: 56.4               # optional PERCENT, stored as the fraction 0.564
pick_rate: 2.1                # optional PERCENT, stored as 0.021
level_recommended: 8          # optional, 1-10
early_units: [DA_18_Sivir]    # optional; may overlap the board
flex_units: [DA_18_Shen]      # optional; swaps, so not units already on the board
board:                        # ≥1 unit; row 0 (front) to 3 (back), col 0-6; star 1-3 (default 2)
  - { unit: DA_Draven18, row: 3, col: 0, carry: true, priority: 1, items: [DA_GuinsoosRageblade, DA_KrakensFury, DA_Deathblade] }
  - { unit: DA_18_Maokai, row: 0, col: 3, star: 1, items: [DA_GargoyleStoneplate] }
guide: |                      # optional markdown; raw HTML is not rendered
  **Early:** ... **Mid:** ... **Positioning:** ...
```

**Comp checks** (on top of the schema; all issues are collected as for tier lists):
- The slug matches the file name, and slugs are unique across every set folder.
- Units belong to the folder's set, and items may be any stored item. A typo gets a "Did you mean …?".
- Each unit and each hex appears at most once on the board. A unit holds at most 3 items, and at least one unit is a carry.
- An emblem can't go to a unit that already has its trait, from the champion itself or from an earlier emblem.
- Early and flex lists have no duplicates, and flex units aren't already on the board.
- `priority` (item priority, 1 first) only goes to a unit that actually holds items, no two units share one, and the priorities used run 1, 2, 3 with no gap — a lone "3" is a typo for "2" far more often than a deliberate third-of-one. A partial unique index on `(comp_id, carry_priority)` keeps that true for anything else that writes the table.

**Curated stats are author-supplied, never measured.** §0 rules out global aggregation, so `avg_place`, `top4_rate`, `pick_rate` and `level_recommended` are whatever the file says and are all nullable; a comp that states none renders no stats rather than a row of dashes. Rates are authored as a **percent** (62.5) because that is how a stats site prints it, and stored as a **fraction** (0.625) to match `winRate`/`top4Rate` in `src/lib/stats`; `validate.ts` converts and rounds to what `numeric(4,3)` and `numeric(3,2)` can hold.

```yaml
# data/curated/<setId>/champion-tiers.yaml   (item lists: item-tiers.yaml, kind: item)
slug: champions-18.2          # unique across files; lowercase, "-" or "."
kind: champion                # must match the file name
patch: "18.2"                 # TFT patch label, quoted (unquoted 18.10 would be the number 18.1)
current: true                 # the list the site shows; at most one per kind across all files
title: Champion tier list     # optional (this is the default)
summary: What changed.        # optional, shown above the list (→ tier_lists.notes)
tiers:                        # S/A/B/C, all optional; list order = display order
  S: [DA_18_Ashe, DA_18_Sivir]
  A: [ ... ]
notes: { DA_18_Ashe: "Best 5-cost carry this patch" }   # hover notes; keys must be listed in a tier
```

```yaml
# data/curated/<setId>/meta-notes.yaml   (the patch brief on /; see data/curated/18/)
patch: "18.2"                 # TFT patch label, quoted
title: Patch 18.2 brief       # optional; defaults to "Patch <patch> brief"
buffs: [Ashe — Ranger bonus up 15%]   # optional, ≤6 entries, ≤48 chars each
nerfs: [Draven — base AD down]        # optional, same caps
tip: Hold Recurve Bows for Ashe.      # optional, ≤160 chars
```

```yaml
# data/curated/<setId>/openers.yaml   (stage-2 openers on /; see data/curated/18/)
patch: "18.2"                 # TFT patch label, quoted
title: Early openers & item slams     # optional; defaults to that string
openers:                      # 1-8 of them
  - name: Elderwood Brawlers
    tier: S                   # S, A or B — openers are not rated below B (see below)
    core_units: [DA_18_Ornn, DA_18_Xayah, DA_18_Alistar]   # 3-4, and 1- or 2-cost only
    slammable_items: [DA_SunfireCape, DA_GuinsoosRageblade]  # 2-3, in build order
    transition_to: [ashe-fast-9, elderwood-kayle]          # 2-3 published comp slugs
    notes: Slam on Xayah and streak.                       # one line, ≤96 chars
```

**Neither `meta-notes.yaml` nor `openers.yaml` is ever seeded.** It holds no
`api_name`s, so there is nothing to check against the static tables and nothing for
the DB to add. The site reads it straight from the repo during prerender
(`src/lib/curated/meta-brief.ts`, §8), and `seed-curated.ts` knows the name only so
it doesn't warn about an unexpected file. Entries are free text on purpose: a patch
note talks about mechanics and numbers, not just units. A brief with no buffs, nerfs
*or* tip is rejected rather than rendering an empty card.

`openers.yaml` is read the same way, but it **does** hold `api_name`s, so step 3 below
still happens — just during prerender, against `getStaticNames()` and `getComps()`
instead of against the DB during a seed (`src/lib/curated/openers.ts`, §8). It checks
that every unit exists **and costs 1 or 2**, that every item exists, and that every
`transition_to` slug belongs to a *published* comp, so a pivot pill can never link to
a 404. Issues are reported together in the same `file:line:col  yaml.path: message`
form, with the same "Did you mean …?", and any one of them fails the build.

Every cap in the opener schema is a layout constraint rather than a taste one: the
card is a glance on a second monitor, so a fifth unit or a fourth slam pushes the
icon row onto another line at 400px. The C band is left off for the same reason a
comp has one — a stage-2 board you would not open on does not need a row.

**Seed script steps** (`pnpm seed:curated [--dry-run]`; tier lists since Phase 2, comps since Phase 3)
1. Find the files: `data/curated/<setId>/{champion,item}-tiers.yaml` and `data/curated/<setId>/comps/*.yaml`. Other files produce a warning — except `meta-notes.yaml` and `openers.yaml`, which the script knows by name only so they don't warn.
2. Parse the YAML and validate it with Zod. The pure logic lives in `src/lib/curated/{schemas,validate}.ts`.
3. Check every `api_name` against the static tables. Champions must belong to the folder's set; items may be any stored item.
   - Every issue is collected and printed as `file:line:col  yaml.path: message`, with a "Did you mean …?" drawn from api names and display names.
   - Any issue aborts the whole run before anything is written.
   - Cross-file rules: slugs are unique, and each kind has at most one `current: true`.
4. Write each list. supabase-js has no transactions, so every step is a single atomic statement that never leaves a list empty:
   - Upsert `tier_lists` by slug.
   - Upsert the entries on `(tier_list_id, champion_api_name | item_api_name)`. This updates tier, position and note in place.
   - Delete the entries that left the file.
   - Then flip `is_current`: clear the kind's old current list first (unique index), then set the new one.
   - A failed run is fixed by re-running it, and pages keep their cached copy until step 6.
   - Tier lists whose YAML was removed stay in the DB as history.
5. Write each comp with the `seed_comp` RPC (§4.9). It's one transaction per comp, so swapping two units' hexes is fine. Then unpublish every published comp whose slug no longer has a file.
6. `POST /api/revalidate` with the tags that were written (`tiers`, `comps`). The script skips this with a warning when `SITE_URL` is unset. The site must already know a tag: a deploy that predates `comps` answers 400, and the script exits 1 after writing the data.

---

### 7.1 Automated tier lists (`pnpm sync:meta`, Phase 6 Task 4)

The two tier-list YAML files can be **generated** from an external meta feed instead
of being written by hand. They stay curated content in the §0 sense — the repo file
is still the source of truth, still Zod-validated, still seeded by the same script,
and still reviewed in a git diff before it goes anywhere. What changes is who types
the ratings.

This does **not** contradict §0's "no global win-rate aggregation": we are not
measuring anything. We read a number someone else publishes and write it into a file,
the same way the curated comp stats are copied off a stats site by hand today.

**Source.** MetaTFT's public stat API, `https://api-hc.metatft.com/tft-stat-api/{units,items}`,
with `queue=1100` (ranked), `patch=current`, `rank` and `days`. Two properties are
what make it usable without scraping:
- It reports **`api_name`s** (`DA_18_Ashe`, `DA_InfinityEdge`), not display names, so
  there is nothing to transliterate in the happy path.
- It reports an **eight-bucket placement histogram**, not a rounded average, so
  average placement is computed here and the sample size is known.

A browser automation path (Playwright) was considered and is not used: the feed is
JSON, so a headless browser would add a dependency and a failure mode for nothing.

**Tier bands** (`meta-sync.ts`, pure and tested). Rows are sorted by average
placement, best first, and that *ranking* is cut into **percentile bands**: `S` the
top 15%, `A` the next 30%, `B` the next 35%, `C` the rest. Entries inside a tier stay
best average placement first, which is the display order §7 already defines, and ties
break on `api_name` so the same feed always writes the same bytes.

Percentiles rather than absolute cutoffs because the two lists have different shapes:
champions bunch inside a fifth of a placement around 4.5 while items spread twice as
wide, so one pair of fixed cutoffs cannot rate both. Measured on the same feed, fixed
cutoffs gave champions `S 9 · A 2 · B 13 · C 31` — a histogram slice, not a tier list —
against items' `S 30 · A 34 · B 17 · C 8`. The bands give both `15 / 30 / 35 / 20`.

Two details keep that honest:
- The shares are accumulated **before** rounding (`tierCuts`), so rounding error cannot
  compound across four bands: the cuts stay ordered and the last is exactly the row
  count, which is what puts every rated row in exactly one tier at any list size.
- A band is **extended over a tie** rather than splitting it (`assignTiers`). Two rows
  with the same average must not land in different tiers, since with the `api_name`
  tiebreak that would read as alphabetical order deciding a rating.

The trade is that a tier is now **relative to its list**: a C-tier unit is in the bottom
fifth of what is played, not bad in the abstract, and every list has an S tier even on a
flat patch. The generated header therefore records where the bands actually fell — each
tier's size and worst average placement — since that boundary moves from run to run and
cannot be worked out from the shares.

**What is rated.** Champions: shop units of the folder's set — the Riftbeasts and
summons of §11 are rated by the feed but belong on no tier list. Items: `completed`,
`emblem` and `artifact` by default (`--item-kinds` to change it, confirmed as the
standard filter 2026-09-12); components and consumables have an average placement
without being tier-list material, and radiants split each item into a thin second
sample. That default rates 89 items, against the 22 the hand-written sample listed —
`/tiers/items` groups by kind, so the longer list is what the page is built for. Rows under `--min-games` (default 500) are
reported and skipped rather than rated on noise.

**Guardrails.**
- Names are resolved against `champions` / `items` first. An exact match wins; a near
  miss goes through the same `suggestApiNames` that powers the seed's "Did you mean …?",
  and is accepted **only when it is unambiguous**. Anything else is reported and skipped.
- The generated text is run through `validateTierList` — the same function
  `seed:curated` runs — *before* either file is written. Any issue aborts the whole run
  with `file:line:col` and leaves both files untouched.
- The feed labels its own set and patch. A set that disagrees with `--set`, a set with
  no static data, or the two feeds disagreeing with each other all abort.

**What a sync preserves.** `notes:` (the hover notes) are carried across runs and
re-attached to entries that are still listed; notes for an entry that dropped out are
removed, since §7 rejects a note that is in no tier. `current:` is preserved too, so a
list that was not the site's current one does not silently become it.

**When a sync writes.** Only when the *ratings* change — the tiers, their order, the
patch, `current`, or the notes. The provenance header carries a sample size that grows
between any two runs, so comparing file text would rewrite both files every run and
bury a real tier change in daily noise (`tierListFingerprint`).

**The honest caveat, recorded because the numbers look more authoritative than they are.**
A unit's average placement is the average of the *boards it appeared on*, not a measure
of the unit. A 5-cost that mostly appears in games somebody had already won reads better
than it plays, and a unit that is only ever played as a bad-spot pivot reads worse. The
bands are a starting point for a human pass, which is exactly why `notes:` survives a
sync and why the generated `summary:` names its source and sample on the page.

---

### 7.2 Automated comps (`pnpm sync:meta`, Phase 6 Task 5)

The same script also generates the comp files. The rules of §7.1 carry over — the repo
file is the source of truth, Zod-validated, seeded by the same script, reviewed in a
git diff — but a comp is a far larger claim than a tier-list row: a board, star goals,
item builds and an order to build them in. Most of what follows is therefore a stated
rule for turning "what people played" into "what to play", not a measurement.

**Source.** A *different service* from §7.1: `https://api-hc.metatft.com/tft-comps-api`.
Three calls, `2 + N` requests in all:
- `latest_cluster_info` — the patch's comp clusters: `units_string`, `traits_string`
  and the weighted `name` parts MetaTFT builds its comp names from.
- `comp_options` — every cluster's `{count, avg}` in one response, which is what makes
  selection possible without fetching all 54 comps.
- `comp_details?comp=&cluster_id=` — per comp: `positioning` (a hex histogram per
  unit), `builds` (item sets with counts), `unit_stats` (appearance share, star and
  item-count distributions), `final_levels`, `levels`, `early_options` and `ranks`.

**Two properties of this feed decide the design, and neither is obvious:**
1. **It ignores `rank` and `days`.** Verified: the response is byte-identical with and
   without them. So the bracket is applied *here*, from each comp's own `ranks`
   breakdown — boards and a weighted average summed over the requested ranks, and the
   bracket's own total recovered from the feed's per-rank `pick` (`count / pick`) so
   our pick rate matches the number MetaTFT itself shows.
2. **It publishes no placement histogram for comps** — only a count and a mean. Unlike
   §7.1's units and items there is no eight-bucket `places`, so **top-4 rate cannot be
   derived** and `top4_rate` is left out of the file rather than guessed. `gem`
   consequently reads as *pick rate < 3% and average placement ≤ 4.30*: the low-pick
   half of the intended rule exactly, with average placement standing in for the other.

**Hexes.** The feed numbers hexes `cell_1`…`cell_28` from the **back** row forward,
which is the opposite of our rows (0 is the front line): `row = 3 - floor((cell-1)/7)`,
`col = (cell-1) % 7`. This was established from the data, not assumed — tanks sit in
cells 22-28 and ranged carries in cells 1-7 in every comp checked.

**How a comp is built.** All of it is the feed's own modal choice:
- **Board:** the `level` most-played shop units, where `level` is the modal final
  level. The share floor is deliberately low (5%): a cluster is fuzzy, so demanding a
  unit appear on *most* boards leaves a level-8 comp with five units. A comp with fewer
  than 6 writable units is skipped and said so — which is what catches the comps built
  around Riftbeasts and other summons (§11), since none of them can be written down.
- **Hex:** each unit's most-played cell, assigned greedily most-played unit first. Two
  units wanting one hex is normal, so the loser falls through to its own next-best.
- **Star and items:** the modal star level, and the best-sampled item build that is
  writable. A build is rejected *whole* rather than having an item stripped out of it,
  because a build minus its emblem is a build nobody played. Rejected: unknown items,
  components and consumables (real boards hold half-built items; on a comp they read as
  advice to leave a Recurve Bow on your carry), and an emblem for a trait the unit
  already has, which `validateComp` refuses anyway.
- **Carry and priority:** a carry is a unit whose **written** build fills its item
  slots. Reading this off the build that is actually in the file — rather than off how
  many items the unit usually holds — is what keeps the two consistent: a unit whose
  most-played build is one Thief's Gloves is not also written as a three-item carry.
- **Tier:** the §7.1 percentile bands (`assignTiers`), over the selected comps' average
  placements. **Style:** a three-starred 1-3 cost carry means `reroll_<cost>` whatever
  level it ends on; otherwise the modal final level gives `fast9` / `fast8` / `flex`.
- **`guide`:** assembled from the feed's numbers — the most-played opener, the level
  timings, the carries' builds — and says in its last line that these are boards people
  played rather than a plan somebody wrote.

**Hand-written comps are never touched.** A generated file's first line is
`# GENERATED by \`pnpm sync:meta\``. A file without that marker is reported and kept,
even when the sync has a comp of the same slug — so adopting a generated comp as your
own is just deleting its header. Generated files that drop out of the selection are
removed, which is what keeps `/comps` to the current meta rather than an accreting
pile. Hand-written files never drop out.

**Before anything is written**, every generated comp goes through `validateComp` and
`checkCompSet` — the same functions `seed:curated` runs — and any issue aborts the whole
run with `file:line:col`, leaving every file untouched. A sync writes a comp only when
its ratings change (`compFingerprint`, which ignores `summary` because it quotes a
sample size that grows between any two runs).

**Flags:** `--no-comps` to sync only the tier lists, `--max-comps` (default **25**, raised from 12
in Phase 6 Task 8) and `--min-boards` (default 300 boards in the bracket).

The count, not the floor, is what bounds the list. On patch 18.2 the 25th comp still has ~7,000
Diamond+ boards and a ~1% pick rate, so lowering `--min-boards` would add no comp; it stays as the
guard for early in a patch, when a cluster can be that thin.

---

### 7.4 Champion best-in-slot (`pnpm sync:bis`, Phase 6 Task 7)

**Source.** `GET {STAT_ORIGIN}/unit_detail?queue=1100&patch=current&rank=…&days=N&unit=<api_name>`,
one request per shop champion. It returns, for that champion, every item **build** that
was played (`buildNames`, a `|`-separated list of item api names) and every single
**item** it held, each with the same eight-bucket `places` histogram §7.1 reads — so
average placement is **computed**, never scraped. `games[0].patch[0]` is the patch label.

This is why the page is derived rather than hand-written: a curated BIS for 60
champions would be 60 opinions typed from memory, and the repo already refuses to
invent data it can measure (§7.2, and the "ability is not available" note in Phase 6
Task 3).

**Rules** (all pure, in `src/lib/curated/bis-sync.ts`, so they are tested without the network):
- **Primary BIS** is the 3-item build with the **best average placement** that clears
  `--min-build-games` (200). Deliberately not the most-played build: most-played
  measures what people default to, and the page is asked what wins. Games break a tie,
  so the better-evidenced build takes it.
- **Alternatives** are the champion's best single items *outside* that build, over
  `--min-item-games` (500). That is what "flex" means in practice — the slot you change
  when the third component doesn't come.
- **Completed items only.** Emblems are a trait slot, not an item choice; artifacts and
  radiants cannot be built on demand. Left in, artifacts dominated the ranking (they are
  rare, so the boards holding them were already winning) and produced builds nobody can
  copy — and having no components, they left the role unreadable.
- **Role** is read off the **components of the primary build**, not off the champion: four
  of six defensive components is a Main Tank, and otherwise the larger of AD/AP wins, with
  **damage beating defence on a tie** (Edge of Night + Infinity Edge + Quicksilver is two
  offensive and two defensive components, and is still an AD carry's build). Sparring
  Gloves and Spatula count for nothing — they say what an item costs, not what it does.
- A champion with **no build clearing the floor gets no row**, and the run prints why.
  On patch 18.2 that is 18 of 64, mostly the eight Lux trait variants and the 1-costs
  that rarely hold three items.

**Carried across syncs:** `notes:` only, exactly as §7.1 carries hover notes. Builds,
roles and numbers are measured and always rewritten; guidance is hand-written and kept.
The generated text is checked against `championBisFileSchema` — the same schema the site
parses at build time — before anything is written, and a run that changes no build leaves
the file alone so a re-sync does not churn git.

**Flags:** `--dry-run`, `--rank`, `--days`, `--min-build-games`, `--min-item-games`, `--set`.

---

### 7.5 Augments (`pnpm sync:meta`, Phase 6 Task 10)

**Why there are no augment stats.** Riot's Set 18 match payload carries **no `augments` field**
— our real fixture's participants hold `companion, gold_left, last_round, level, missions,
placement, players_eliminated, puuid, riotId…, time_eliminated, total_damage_to_players, units,
traits, win` and nothing else — so no site can compute an augment's placement. MetaTFT agrees
by omission: `tft-stat-api/augments`, `augments_full` and `augments_full2` answer **500** for
every parameter set tried, and `comp_details.augments` holds one empty-named row. The task asked
for average placement, top-4 and pick rate cut into the §7.1 percentile bands; with no number to
band, neither is written, and the schema has no stat fields rather than fields that are always empty.

**Sources.** Two MetaTFT routes, both found by reading the site's JS bundle as in §7.2, plus
CommunityDragon:
- `GET {STAT_ORIGIN}/augments_tiers` — MetaTFT's **expert** augment tier list: S–D labels, each an
  ordered list of api names, with its author and update time.
- `GET {COMPS_ORIGIN}/comp_augment_tiers?cluster_id=` — per comp cluster, the augment grades of the
  guide MetaTFT matched to it (`source_title`, `distance`, `augments[{id, tier}]`). On patch 18.2
  that is 22 clusters sharing 11 distinct guides. Set and cluster id are checked against the comps run.
- CommunityDragon `en_us.json` at the game-data version `sync:static` stored (`tft_sets.patch`),
  for the set's augment pool (`setData[].augments`):
  - name, and an icon from the same pinned directory as every other icon;
  - **rarity** from hashed tags — `{d11fd6d5}` Silver, `{ce1fd21c}` Gold, `{cf1fd3af}` Prismatic.
    583 of the 592 pool augments carry exactly one, and it agrees with the `_i`/`_ii`/`_iii`
    icon suffix wherever there is one;
  - **description** through `augmentText`, the §4.8 placeholder resolver. Unlike a trait row, an
    augment with any unresolved placeholder gets *no* description, not a visible "?": on 18.2 every
    listed augment resolves (248 of 248).

**Rules** (pure, in `src/lib/curated/augment-sync.ts`):
- **Tier** is MetaTFT's grade with D folded into C, in the author's order inside a tier. An augment
  CommunityDragon doesn't know (newer than the pinned game data) or that has no rarity tag is
  skipped and reported, never guessed.
- **A comp's picks** (4–6) come only from a guide **whose named carries the comp fields**
  (`guideFitsBoard`: "ZYRA & SORAKA > …" needs both, "CINDERLING / PEBBLES > …" either). MetaTFT
  hands each cluster its *nearest* guide however far away — Executioner Malphite and Blossom Sett
  Sivir both inherited "AHRI & Morgana" — so without this a comp page recommends another comp's
  augments. A carry is a name a reader can check; a `distance` cutoff would not be.
- **Order:** the guide's grade; then how much higher this guide grades an augment than the distinct
  guides do on average (`guideConsensus`, ungraded counting below C, guides deduplicated by title);
  then the global tier; then the guide's own order. One per family ("Glass Cannon I"/"II",
  "Branching Out"/"+"). Under 4 listed picks, none.
  - Ranking against the *global* list instead was tried first: "Feeling Lucky" topped 7 of 9
    comps, because that measured where two lists disagree rather than what a comp wants.
- On patch 18.2: **248 augments** (`S 23 · A 89 · B 118 · C 18`; Silver 68 · Gold 111 · Prismatic
  69), 10 skipped as newer than game data 16.18, and **9 of 25 comps** with picks. Two guide pairs
  grade the same augments (Draven/Ashe, Ahri/Zyra), so those comps share picks — the feed's answer.

**The file** is generated only. It carries its own names, icons and rarity, because augments are
not in the static tables, so `augmentTiersFileSchema` is the whole contract: icon URLs must match
the `next.config.ts` remote pattern, a comp may only pick listed augments, and nothing is listed
twice. `parseAugmentTiers` — the function the site runs at build — checks the text before anything
is written, and the file is rewritten only when `augmentTiersFingerprint` (everything but `source`,
which quotes MetaTFT's update time) changes. `--no-augments` skips it; under `--no-comps` the picks
already in the file are carried over while every pick is still listed.

```yaml
# data/curated/<setId>/augment-tiers.yaml   (GENERATED by pnpm sync:meta)
patch: "18.2"
source: MetaTFT augment tier list by …, updated 2026-09-13. Expert grades rather than placement stats: …
augments:                     # best tier first, the author's order inside a tier
  - api_name: DA_PandorasBench
    name: Pandora's Bench
    rarity: Silver            # Silver, Gold or Prismatic
    tier: S                   # S/A/B/C
    icon_url: https://raw.communitydragon.org/16.18/game/assets/maps/tft/icons/augments/hexcore/pandoras-bench-ii.png
    description: At the start of every round, …   # optional, ≤600 chars
comps:                        # keyed by comp slug; a comp without an entry shows no panel
  adaptor-master-yi:
    source: MASTER YI > Adaptor > Lvl 7 reroll
    augments: [ DA_ForgedInStrength, DA_CookingPot, DA_18_BranchingOutPlus, DA_SpreadingRoots ]   # 4-6
```

---

## 8. Rendering & caching in Next.js
- **Cache Components (`cacheComponents: true`)** is how tag-based caching is done in Next 16:
  - Uncached data and request-time `params` must render inside `<Suspense>`. The static shell prerenders and the rest streams in. `/comps/[slug]` is already Partial Prerender.
  - Client components using `usePathname` (the nav) sit in a Suspense boundary. Without it, dynamic routes fail the build.
- **Curated/static pages** (`/comps`, `/tiers/*`) are Server Components.
  - Query functions (`src/lib/curated/queries.ts`) use `'use cache'` + `cacheTag(...)` + `cacheLife('days')`, so they prerender into the static shell.
  - The build output shows `/tiers/*` as static with revalidate 1d and expire 1w. The one-day lifetime is only a safety net; the scripts revalidate on demand.
  - Tags are listed in `src/lib/cache-tags.ts`: `static` (sets, traits, champions, items), `tiers` and `comps`. Tier and comp queries also carry `static`, since they join champion, item and trait data.
  - `/comps` is static (revalidate 1d, expire 1w). `getComps()` returns the active set's published comps, with traits computed on the server, and a client `CompList` filters them.
  - `/comps/[slug]` is Partial Prerender.
    - `generateStaticParams` returns every published slug. Cache Components rejects an empty list, so with no comps it returns the placeholder `__none__`, which renders the 404 page.
    - Other slugs get the App Shell and stream in on first visit. `notFound()` runs inside Suspense, so an unknown slug is a soft 404: status 200 with `noindex`.
    - `generateMetadata` uses the same cached `getComp(slug)`.
  - `POST /api/revalidate` needs `Authorization: Bearer $REVALIDATE_SECRET`, compared in constant time. The body is `{"tags": [...]}` using known tags only.
  - It calls `revalidateTag(tag, { expire: 0 })`. That's the Next 16 form for callers outside a Server Action, and the next visit renders fresh data instead of serving the pre-seed copy once more. The one-argument form is deprecated.
  - The page (a Server Component) fetches data. Interactive parts are client components that get plain props: `ChampionTierBoard` (cost filter state) and `ItemTierBoard`.
  - Both boards share one tooltip (`useHoverTip`/`HoverTip`). It opens on mouse hover, focus or tap, stays inside the viewport, and closes on leave, blur, Escape, scroll or a tap elsewhere.
- **`/me` and `/`** read only from Supabase; Riot is never called during render. Both are **Partial Prerender**: a static shell plus streamed islands (Phase 5).
  - **Player reads stay uncached** (`src/lib/stats/queries.ts`), which is the §6.3 principle applied to Next's cache as well as Supabase's. Two concrete reasons, not just principle: the header renders a live cooldown countdown from `sync_state.next_allowed_at`, which a cached read would serve wrong by construction; and `after()` stale-on-read writes new matches *after* the response has flushed, with no clean revalidation hook from inside `after()`, so a cached read would serve pre-sync data for a whole `cacheLife` window. Each view is one index-covered query over ≤50 rows — caching would buy ~30ms and cost correctness. `CACHE_TAGS` is therefore unchanged.
  - The stats path uses the **anon** client throughout: `player_matches`, `riot_accounts` and `rank_snapshots` are all anon-readable (§4.6). Only the sync badge needs the service role, which is why `/me` splits into two islands — `MeHeader` (service role, `sync_state`, paints first because it answers "am I looking at fresh data?") and `Dashboard` (anon, the 50-row query). One island would make the faster, more important half wait on the slower one.
  - `/` splits along the same caching boundary: `TopComps` reuses the cached `getComps()` that `/comps` already reads — a hit under the same `comps` tag, so no new query and no new tag — and prerenders into the shell, while `OverviewGlance` is uncached and streams in. `OverviewGlance` returns a **fragment of two `<section>`s** rather than a wrapper, because Suspense creates no DOM box of its own and a wrapper would collapse the grid's three columns into two; its fallback renders two skeletons for the same reason.
  - **`MetaBrief` (`/`) reads the repo, not the DB.** `getMetaBrief()` is `'use cache'` with **`cacheLife("max")`** and **no cache tag**, unlike every other curated read: the YAML ships inside the deployment, so only a new build can change it, a new build id already invalidates the entry, and there is nothing for `/api/revalidate` to revalidate. It is parsed once during prerender and never on a request. A missing file renders nothing; a malformed one throws and fails the build, the way `seed:curated` aborts.
    - Every path it reads is joined from the **literal** prefix `process.cwd() + "data/curated"`. That is load-bearing, not style: given a path built from `process.cwd()` alone, Turbopack cannot tell what it resolves to, warns "Dynamic filesystem access causes tracing of the whole project", and ships the entire repo inside the server bundle. The static prefix narrows the trace to that one small folder — and is also what gets the YAML into the deployed function, so no `outputFileTracingIncludes` entry is needed (verified in `.next/server/app/page.js.nft.json`).
    - `yaml` therefore moved from `devDependencies` to `dependencies`: Turbopack bundles it into the server chunk, so it is now a runtime dependency of the site and not just of the scripts.
    - It is a direct child of the page's grid with `md:col-span-3`, so it takes the whole second row and the three panels above keep their columns.
  - **`OverviewOpeners` (`/`) reads the repo *and* the DB.** `getOpeners()` parses `openers.yaml` the same way, but resolves its api names and pivot slugs through the cached `getStaticNames()` and `getComps()`, so it is `'use cache'` with **`cacheTag("static", "comps")`** and `cacheLife("days")` — a `sync:static` or `seed:curated` has to be able to refresh the names, icons and comp titles it renders, which is exactly what `cacheLife("max")` would prevent. `getComps()` is the same cached read `/comps` and `TopComps` already make, so this adds no query. It shares `readNewestCuratedFile()` (and its literal-prefix tracing rule) with `MetaBrief`.
    - A file naming a unit that isn't there, a unit that costs more than 2, or a comp that isn't published **fails the build**, listing every such problem at once. That is the point of resolving at build time rather than rendering a fallback: a dead pivot link on a glance panel is worse than a red build.
    - Server-rendered with **no client component of its own** — it is read between rounds, not interacted with. Like `MetaBrief` it spans `md:col-span-3` and makes its own columns (`md:grid-cols-2 xl:grid-cols-4`); eight cards inside a third of the grid would be a column of slivers.
- **`/bis`** is fully **Static**: `getChampionBis()` is a cached read of a generated repo
  file, and nothing on the page depends on the request.
  - Tagged **`static`** alone (not `comps`): the YAML ships in the deployment, but every
    name, icon and cost it renders comes from the static tables, so `pnpm sync:static` has
    to be able to refresh it.
  - It resolves its api names the way `getOpeners()` does, and additionally reads
    `items.components` / `items.grants_trait` for the tooltip — filtered with `.in()` to the
    items the file actually names, because `items` holds 771 rows in Set 18.
  - `BisBoard` is a client component for the cost and role filters and the shared
    `HoverTip` only; the rows themselves are prerendered.
  - **The tooltip shows name, emblem trait and recipe — not item stats.** `items` stores no
    stat or description text, so that would need a new `sync-static` source; flagged here
    rather than faked, as in Phase 6 Task 3.
  - **`NAV_ITEMS` gained a sixth entry**, and the number shortcuts are derived from its
    length, so `6` now navigates and `Me` moved from `5` to `6`. `shortcut-match.test.ts`
    pins the order so the next such move is caught rather than silent.
- **`/augments`** is fully **Static**: `getAugmentTiers()` reads the generated `augment-tiers.yaml`
  with **`cacheLife("max")` and no tag** — the `MetaBrief` rule, not the `/bis` one, because the file
  carries its own names, icons and rarity, so nothing in it comes from the DB and only a deployment
  can change it. The build reports it as revalidate 30d / expire 1y.
  - `AugmentBoard` is a client component for the tier and rarity filters and the shared `HoverTip`
    only; the cards are prerendered.
  - **`NAV_ITEMS` gained a seventh entry** after BIS, so `6` is now Augments and `Me` moved to `7`.
  - `/comps/[slug]` reads the same cached file for its "Best augments" panel, **after** awaiting
    params. Started alongside them, the read resolved inside the generic fallback shell and stamped
    `cacheLife("max")` on it (the build listed the shell at 30d / 1y where it had shown no lifetime);
    awaited first, every route keeps the shape and lifetime it had. The panel uses native `title`
    tooltips: the page has no `HoverTip`, and six descriptions do not earn a client island.
  - **`refreshMyMatches` calls `refresh()`**, unconditionally. `refresh()` (Next 16, Server-Action-only) re-runs a route's *uncached* server content, which is exactly what a sync changes. The Phase 4 code called `revalidatePath("/me")` and only when `newMatches > 0`, which was wrong twice over: a "you're up to date" refresh never re-rendered, so the sync badge and cooldown countdown kept showing pre-sync values; and what `revalidatePath` invalidates is the prerendered shell, the one part that didn't change. Every `SyncResult` variant also carries `nextAllowedAt` now, so `RefreshButton` starts its countdown from the action's return value instead of waiting for the re-render.
- Icons come from CommunityDragon URLs via `next/image`.
  - `remotePatterns` allows only `https://raw.communitydragon.org/*/game/assets/**` with no query string.
  - `minimumCacheTTL` is 31 days, because a version-pinned URL's content never changes.
  - Next 16's default `imageSizes` start at 32, so a 16px icon is served as the 32px variant.
  - The icons can be mirrored to Supabase Storage later if needed.

---

## 9. UI system (dark, dense, scannable)
- **Palette:** background `zinc-950`, panels `zinc-900`, 1px `zinc-800` borders, text `zinc-100`/`zinc-400`. Base text is 13px. Numbers use `tabular-nums`.
- **Semantic colors:**
  - Cost borders: 1 gray, 2 green, 3 blue, 4 purple, 5 gold.
  - Tier badges: S rose, A orange, B amber, C lime.
  - Placement pills: 1st gold, 2–4 teal, 5–8 muted.
  - Trait styles: bronze, silver, gold, prismatic, plus orange for unique (1-unit) traits. Active trait icons are black on a hexagon in the style color; inactive ones are gray.
  - Star goals: ★ bronze, ★★ silver, ★★★ **emerald** (`--color-star-3`). Not a third metal: ★★★ marks a reroll target — the comp's win condition — and the old gold sat directly on top of the gold 5-cost border, the same collision `--color-carry` was created to avoid.
  - Gem badge: `--color-gem` (warm amber), kept clear of `tier-b` and `cost-5`, which sit inches away on a comp row. The word "Gem" and a ◆ glyph both carry the meaning, so the colour is reinforcement rather than the only channel.
  - Comp badges (`comp-badges.tsx`, rules in `curated/comp-badges.ts`), each a word plus a shape under the same rule:
    - **Contested** at pick rate ≥ 12%: a `--color-contested` (coral) pill with a flame glyph — the Gem pill's opposite. Coral sits between tier-s rose and tier-a orange but is far more saturated than either.
    - **Difficulty**: outlined tint chips with 1-3 rising bars — Easy `--color-diff-easy` (emerald), Medium `--color-diff-medium` (slate), Hard `--color-diff-hard` (rose). Pale tints, never solid plates, so Hard does not read as the solid rose S plate on the same row.
    - **Playstyle** (Fast 8/9, N-cost reroll, Flex): a neutral chip with chevrons or rolling arrows; the tier plate and stats already spend the row's colour.
  - Carry marker: `--color-carry` (near-white), placed **outside the cost ramp on purpose**. Phase 3 used the gold accent, which read as the 5-cost cost border and left a 5-cost carry indistinguishable from an ordinary 5-cost. A `CarryMark` crosshair glyph carries the same meaning as a *shape*, so it survives colour-vision deficiency.
  - Patch brief: `--color-buff` (green) and `--color-nerf` (red), their own tokens for the same reason as `--color-carry` — the page's LP delta already spends `place-top4` and `tier-s` on "up" and "down", and a second meaning on the same colours would be ambiguous where they sit inches apart. Each badge also carries a ▲/▼ glyph, so **shape** says buff-or-nerf too.
  - Augment rarity (`RarityPill`): an outlined tint plus the word, in the **trait-style** silver / gold / prismatic tokens — reused rather than new, because the game uses one metal ladder for both. Never a solid plate: the tier badge beside it is the solid one, and the word carries the meaning without the colour.
- **Layout:**
  - A single top nav: Overview · Comps · Champions · Items · BIS · Augments · Me.
  - Keyboard shortcuts `1–7` switch pages and `/` focuses search (`Shortcuts` in the root layout; `NAV_ITEMS` is exported from `nav-tabs.tsx` so routes and shortcuts can't drift). The decision lives in the pure `shortcut-match.ts`, because that's where shortcuts actually go wrong: they stay inert while focus is in an input, textarea, select or contenteditable, and never fire with Ctrl/Alt/Meta held. `/` only calls `preventDefault()` once it has found a search box, so on pages without one the browser's quick-find still works. Links carry `aria-keyshortcuts`.
  - Optimized for a half-width 1080p window (~960px) that also degrades to phone width.
- **Key components:**
  - `ChampionIcon`: cost border, star pips, mini item icons.
  - `/tiers/champions` groups **by cost (default) or by tier**, via `Segmented`. Cost answers "what should I buy at this stage?", the question in front of you while the shop is open; tier answers the one the page is named after, and the curated data is tier-first, so neither view could be dropped.
    - The cost rows are a **pure regrouping** of the same entries (`groupChampionsByCost` in `src/lib/curated/champion-groups.ts`), so the cost filter, tooltip and note dots behave identically in both.
    - Rows are strongest-first **by inheritance, not by a comparator**: `getChampionTierList()` already returns S→C with each tier in its YAML `position` order, so bucketing stably preserves both. Re-sorting would discard the author's hand-written ranking within a tier.
    - In cost rows each icon carries a corner `TierBadge`. Left-to-right order is otherwise the only signal that a row is ranked, and that signal disappears the moment a row wraps.
    - A cost outside 1–5 gets its own trailing row rather than being dropped; the DB check should make it unreachable, but a champion silently vanishing is a worse failure than an odd extra row.
    - The tooltip shows name, cost, **tier**, traits and the note. Not the ability: `champions` stores only `api_name, cost, icon_url, is_shop_unit, name, set_id, traits`, so abilities would need a new `sync-static` source.
  - `TraitBadge`: style color and count.
  - `TierRow`: tier label plus a wrapping icon row. `CostRow` is its twin for the cost view — same label-column/`min-h-11`/em-dash-when-empty shape, so the two groupings of one board read as one layout. Its label is a *tinted* plate rather than `TierBadge`'s solid one: "1-cost" is five times the width of "S", and five saturated blocks down the left edge would outweigh the icons they label.
  - `HexBoard`: 4×7 pointy-top hexes, front row (0) at the top, odd rows shifted right by half a hex.
    - Positions are percentages of an aspect-ratio box, so it scales from 400px to about 512px wide.
    - Each unit shows a cost-colored rim, a gold outer rim when it's a carry, star pips and up to 3 item icons, with details on hover.
  - `/comps` rows: tier, name (+ Contested / Gem badges), playstyle and difficulty chips, then the curated stats; carries (with items), a divider, then the rest of the board; active traits as icon + count.
    - Units are ordered carries → stated item priority → cost → name, so "1st" reads first in both the lineup and the guide's item builds.
    - `PriorityChip` ("1st"/"2nd"/"3rd") and the ★★★ pips are pinned over the portrait's top corners rather than stacked above it, so a lineup mixing units with and without them stays one height.
    - The name row **wraps** instead of shrinking: a long name plus the Gem badge pushes the badge to a second line rather than eating into the name and truncating it.
    - `CompStatsRow` takes a `fields` list because the name column only fits three stats before the fourth wraps onto a ragged line — the list shows avg/top-4/pick and leaves the recommended level to the guide page.
    - The Gem and Contested tooltips are bodies on the list's one shared `HoverTip` (`"badge" in item`), not extra tooltip instances.
    - **Trait tooltip** (`TraitDetails`, on `/comps` rows and in the guide's `CompTraitList`), laid out after OP.GG's since Phase 6 Task 9: the hex icon, the name in bold with its type (Origin / Class / Unique, §4.8) underneath, the description, then the breakpoints as numbered circles where **only the tier the board sits on** is lit — a white-filled circle, bold white text and a ringed row — while every other tier, reached or not, stays muted; then "Champions", every member cheapest first on its cost border. The style colour lives on the hex alone, so the lit tier is one signal rather than two competing ones. Stat text passes `cleanStatText`, which rounds any number with three or more decimals and drops a `.0` (`7.00001%` → `7%`) — a guard, since `sync:static` already rounds what it substitutes. Members not on this board are dimmed — matched **by name**, because a champion's several forms (the nine Lux elements) are listed once. With no synced text it says "No description synced for this trait yet." and falls back to the bare breakpoints. It uses `HoverTip`'s `wide` variant (`max-w-80`), and a tip taller than the room on either side is clamped inside the viewport.
    - The data comes from inside the cached `getComps()` / `getComp()`: one `traits` read and one `champions.traits` overlap query, so there is no new cache tag. `getComps()` ships details for **active** traits only (`pickTraitDetails`), since those are the only ones the rows show.
    - The whole row links to the guide, and units and traits keep their own tooltips.
    - Filters: tier and style toggles (only those present), plus search across comp, unit, item and trait names.
  - `PlacementPill` (always prints the digit, so colour is never the only channel), `StatTile`, `Sparkline`, `PlacementHistogram`, `Segmented` (single-select; `ToggleGroup` stays multi-select, and they share exported button classes so the two can't drift).
    - **Charts are inline SVG** (§2). The geometry lives in pure modules — `sparkline-geometry.ts`, `placement-styles.ts` — so it is unit-testable in the node-only suite, which has no DOM. `sparklineGeometry`'s `domain` is **required rather than derived**, which removes the divide-by-zero case: a run of identical placements sits at that value's height instead of an ambiguous mid-height.
    - `Sparkline` draws the line as stretched SVG but positions its dots as HTML, because an SVG circle inside `preserveAspectRatio="none"` stretches into an ellipse at the ~3× horizontal scale this renders at.
    - **Direction:** the sparkline and its pill row both run oldest→newest, left to right, so time flows the way a reader expects; `PlayerSummary.recent` is newest-first per §6.3, so callers reverse it. Match history stays newest-first — a list is not a timeline.
    - `PlacementHistogram`'s text list is the axis *and* the accessible representation, so its bars are `aria-hidden` rather than duplicated content.
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
| `SITE_URL` | local scripts and GitHub Actions, optional | Site that `sync:static`/`seed:curated` revalidate after writing. Empty = skip with a warning. Not needed on Vercel. |

**GitHub Actions** (`.github/workflows/sync-meta.yml`, daily 03:00 UTC + manual): `sync:meta --seed` then `sync:bis`, then commits changes under `data/curated/` to `main` as `github-actions[bot]`. The push redeploys Vercel. Repository secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `REVALIDATE_SECRET`. It runs Node 24 because `@supabase/supabase-js` requires Node >= 22.

`src/lib/env.ts` validates **per scope**: `supabasePublicEnv()`, `supabaseAdminEnv()`, `riotEnv()`, `secretsEnv()`, and `revalidateEnv()` (`REVALIDATE_SECRET` + optional `SITE_URL`, used by `/api/revalidate` and the scripts). Each is lazy and memoized, so a consumer only needs its own variables. Error messages name the variable but never echo its value. The public and admin scopes also reject **swapped keys**: an anon/publishable key in `SUPABASE_SERVICE_ROLE_KEY`, or a service/secret key in the public anon variable.

**Scripts and `server-only`:**
- Scripts run through `tsx --conditions=react-server --env-file-if-exists=.env.local`, as the `sync:static` and `seed:curated` package scripts do.
- The condition lets them import `admin.ts`, which imports `server-only`. Plain Node throws on that import.
- The env-file flag loads `.env.local`. Variables already set in the shell take precedence, e.g. `SITE_URL=http://localhost:3000 pnpm seed:curated`.
- pnpm 12 fails installs on unapproved build scripts, so `pnpm-workspace.yaml` lists `esbuild: false`. tsx's esbuild binary comes from an optional platform package.

---

## 11. Open items to verify during implementation
- [x] Riot platform → region routing table (§5.1), verified live 2026-09-12 rather than from docs, which contradict each other on the SEA shards.
- [x] **`th2` is dead; the account is on `sg2`** (verified 2026-09-12). Riot's account-region lookup reports `sg2` and the `th2` host does not resolve. `RIOT_PLATFORM` must be `sg2` in `.env.local` and on Vercel. `riot-setup.ts` asks Riot rather than trusting the env, and says so when the two disagree.
- [x] After `supabase link`: regenerate `types.ts` with `pnpm db:types`. The hand-written version was overwritten before the first commit, so no diff was possible. `pnpm check` and `pnpm build` pass against the generated types.
- [x] `tft/league/v1/by-puuid` works on `sg2` (verified 2026-09-12: GOLD II, 75 LP). The summoner-id fallback isn't needed.
- [x] CommunityDragon icon path conversion (`.tex` → `.png` URL rule) and the current-set key (Phase 2). Resolved in §4.8: lowercase the path, `.tex` → `.png`, and pin it to the version directory; the set is the newest standard `TFTSet<N>`, with a `--set` override.
- [x] Vercel Hobby function duration and cron limits (Phase 1/4), confirmed at the 2026-09-12 deploy. Hobby accepted the daily `vercel.json` schedule and `maxDuration = 60` on `/api/cron/sync`. A full 20-match sync took 14.6s locally and a no-op run 4.6s in production, so the margin is wide.
- [x] Set 18's Unreal move, checked against a real match 2026-09-12 (details in §6.1): ids are `DA_…` and all resolve; `tft_set_number` is 18; **`game_version` is now the useless literal `"TFT Unreal Version ?.?.?.?"`**, so `patch` comes from `game_datetime` instead (§6.4).
- [x] Riot's match-API trait `style` is **not** used: the style comes from `tier_current` indexed into the stored `breakpoints` (verified 2026-09-12, §6.1).
- [x] Phase 3: replacing `comp_units` needs `unique (comp_id, hex_row, hex_col)` made `DEFERRABLE INITIALLY IMMEDIATE` or a transactional RPC. Resolved with the `seed_comp` RPC (§4.9); the constraint is unchanged.
- [x] **Riftbeast units were missing from `champions`** (resolved 2026-09-12, Phase 4 pre-requisite). Data Dragon's shop list became `is_shop_unit` instead of a filter (§4.8), so all ten are stored with their real costs. The live diff found two the earlier note had missed, Gromp (`DA_Gromp18_AP`) and Mama Beak (`DA_CrimsonRaptor18`).
- [x] Data Dragon's `tft-champion.json` now only sets `is_shop_unit` (§4.8), so if Riot stops publishing TFT data there the sync degrades to marking everything buyable rather than dropping rows. The cost-and-traits test is what keeps summons out, and it holds on its own for Set 18.

---

## 12. Deployment regions (2026-09-12)

**Vercel functions run in `icn1` (Seoul), pinned in `vercel.json`. Supabase is in `ap-northeast-2` (Seoul). These are the same AWS region, and that is the point.**

Phases 1–5 ran on Vercel's default function region, `iad1` (us-east-1, Washington D.C.) — a default for new projects, never a deliberate choice. Since page renders read Supabase on every uncached request (§8), every one of those queries crossed the Pacific at roughly 180–200ms a round trip, and `/me` issues several. That was the half-second gap the Phase 5 verification measured between the ~0.15s TTFB and the 1.1–1.7s full stream.

How each region was established, rather than assumed:
- **Vercel:** the `x-vercel-id` response header reads `<pop>::<region>::<id>` when a function executes. It showed `sin1::iad1::…` — entering at the Singapore PoP, executing in `iad1`.
- **Supabase:** the project API host sits behind Cloudflare and reveals nothing, but the direct database host `db.<ref>.supabase.co` resolves to an AWS address. It falls inside `2406:da12::/36`, which AWS publishes as `ap-northeast-2`.

Vercel's `icn1` maps to `ap-northeast-2`, so the alignment is exact. Hobby permits a single function region, set with the `regions` key in `vercel.json`.

The change improves **both** network legs at once, which is what made it unambiguous rather than a trade:
- function → Supabase drops from ~180ms to low single-digit ms per round trip;
- client → function drops from ~230ms (Thailand → Washington) to ~60–80ms (Thailand → Seoul).

Nothing regresses. The prerendered shells for `/`, `/comps` and `/tiers/*` are served from the CDN PoP nearest the viewer regardless of function region, so TTFB is untouched — measured at ~0.13–0.15s before and after.

Measured from Thailand, five samples per route on a warm cache: `/me` full stream **0.46–0.57s** (was 1.1–1.7s), `/` **0.39–0.56s** (was ~1.07s), authorized no-op cron **1.02s** (was 4.6s).

Two notes for anyone re-measuring:
- **Warm the cache first.** The first request to a route after any deploy regenerates the shell and reports an inflated TTFB (0.5–1.0s observed), which reads like a regression but is not.
- **`sin1` (Singapore) is the rejected alternative.** It is closer to the client (~30ms) but leaves a Singapore↔Seoul hop on every database round trip. Since the database round trips outnumber the single client round trip, `icn1` wins. Moving the Supabase project instead would mean recreating it for the same result.
