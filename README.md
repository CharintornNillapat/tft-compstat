# TFT CompStat

A minimalist, dark, data-dense TFT companion site for a second monitor: curated meta comps, champion and item tier lists, and a personal dashboard for one Riot account.

- **Live:** https://tft-compstat.vercel.app
- **Design docs:** [`context/architecture.md`](context/architecture.md) (the source of truth) and [`context/roadmap.md`](context/roadmap.md). Keep them current when behaviour changes.
- **Stack:** Next.js 16.3 (App Router, Cache Components), React 19.2, TypeScript strict, Tailwind v4, Supabase Postgres, Vercel Hobby, pnpm 12.

**The one principle worth remembering:** page renders never call Riot. Pages only read Supabase. Riot is called only by `SyncService`, behind a DB lock and cooldown. Everything in this runbook follows from that — a broken Riot key degrades *freshness*, never *content*.

---

## Table of contents

- [Running it locally](#running-it-locally)
- [Seeding a new patch or comp](#seeding-a-new-patch-or-comp)
- [Riot sync operations](#riot-sync-operations)
- [Verifying the cron](#verifying-the-cron)
- [Rotating the Riot API key](#rotating-the-riot-api-key-personal-key)
- [Regions and latency](#regions-and-latency)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference)

---

## Running it locally

```bash
pnpm install
cp .env.example .env.local     # then fill it in; see Reference → Environment variables
pnpm dev                       # http://localhost:3000
```

Checks, both of which must be green before any deploy:

```bash
pnpm check     # typecheck + lint + test  (209 tests today)
pnpm build
```

To exercise the real caching and Partial Prerender behaviour — `pnpm dev` does not reproduce it faithfully:

```bash
pnpm build && pnpm start
```

Deploys are automatic: a push to `main` on GitHub (`CharintornNillapat/tft-compstat`) builds and promotes on Vercel.

### Database changes

```bash
pnpm db:push      # apply supabase/migrations/* to the linked project
pnpm db:types     # regenerate src/lib/supabase/types.ts — always run after db:push
```

Migrations are named `supabase/migrations/<timestamp>_name.sql` (the Supabase CLI requires that form). **Every new table needs explicit grants and RLS policies** — copy the footer of the init migration.

---

## Seeding a new patch or comp

Two independent jobs. Static game data comes from Riot/CommunityDragon; curated content comes from YAML in this repo. The tier-list YAML can be written by hand or generated — see step 3.

### 1. Static game data — `pnpm sync:static`

Refreshes `tft_sets`, `traits`, `champions` and `items` from CommunityDragon, and pins icon URLs to the game-data version.

```bash
pnpm sync:static --dry-run        # report what would change; writes nothing
pnpm sync:static                  # apply
pnpm sync:static --set 19         # override the set (default: newest standard TFTSet<N>)
pnpm db:types                     # only if the schema changed, not for data
```

Run this **when Riot ships a new set**, or when a patch adds or rebalances units and items. Set 18 currently holds 36 traits, 74 champions and 771 items.

> The script warns rather than fails if Data Dragon's shop list is missing: units then keep `is_shop_unit` true instead of rows being dropped. Non-shop units (Riftbeasts) are stored with their real costs so match derivation can resolve every `character_id`.

### 2. Curated tiers and comps — `pnpm seed:curated`

**The YAML files in `data/curated/<setId>/` are the source of truth.** Git holds the history; the database is a projection of them. Never edit content in Supabase directly.

```
data/curated/18/
  champion-tiers.yaml       S/A/B/C ratings, costs 1–5
  item-tiers.yaml           grouped by kind
  comps/<slug>.yaml         one comp per file
```

To add a comp for a new patch: copy an existing file in `data/curated/18/comps/`, edit it, then

```bash
pnpm seed:curated --dry-run       # validate every file; writes nothing
pnpm seed:curated                 # upsert, then revalidate the live pages
```

Validation is strict and reports `file:line:col` with a suggestion, so a typo stops the seed before anything is written:

```
data/curated/18/champion-tiers.yaml:13:33  tiers.S[2]: unknown set 18 champion "DA_18_Sivr". Did you mean DA_18_Sivir?
```

Comps are also checked for: unique hexes, at most 3 items per unit, at least one carry, no emblem for a trait the unit already has, and no flex unit already on the board. Each comp is written through the transactional `seed_comp` RPC, so a rejected comp leaves the previous version intact.

The seed schemas live in `src/lib/curated/schemas.ts`; the YAML shape is documented in [architecture §7](context/architecture.md).

### 3. Tier lists and comps from the live meta — `pnpm sync:meta`

Optional. It reads MetaTFT's public stats and rewrites `data/curated/<setId>/{champion,item}-tiers.yaml`
plus the generated files in `comps/`, so you don't type 140-odd ratings and a dozen boards
by hand. Contract and caveats: architecture §7.1 (tier lists) and §7.2 (comps).

```bash
pnpm sync:meta --dry-run          # fetch, rate, validate, print what would change; writes nothing
pnpm sync:meta                    # write the two files
pnpm sync:meta --seed             # write, then run pnpm seed:curated
pnpm sync:meta --rank CHALLENGER --days 7
pnpm sync:meta --min-games 2000   # raise the sample floor (default 500)
pnpm sync:meta --item-kinds completed,emblem,artifact,radiant
pnpm sync:meta --no-comps         # tier lists only
pnpm sync:meta --max-comps 8      # how many comps to write (default 25)
```

**Read the dry run before you let it write.** It prints each tier with its average
placements, every name it could not resolve, and a per-entry diff against the file on
disk (`+` added, `-` removed, `~` moved tier).

Tiers are **percentile bands** of the ranking — `S` the top 15%, `A` the next 30%, `B` the
next 35%, `C` the rest — so a tier is relative to its own list, and the generated header
records where the bands actually fell. Champions and items are banded separately.

What it guarantees:
- Nothing is written unless the generated text passes `validateTierList`, the same check
  `pnpm seed:curated` runs. A failure prints `file:line:col` and leaves both files alone.
- An `api_name` it cannot resolve unambiguously is **skipped and reported**, never guessed.
  A name it skips usually means the patch added something: run `pnpm sync:static`.
- Your `notes:` are carried across runs, and `current:` is preserved.
- It writes only when the ratings change, so a no-op run leaves git clean.
- **Your own comps are never touched.** A generated comp's first line is `# GENERATED`;
  a comp file without it is reported and kept, even when the sync has one of the same
  name. Adopting a generated comp as your own is just deleting that header. Generated
  comps that drop out of the meta are removed, so `/comps` does not accrete dead builds.

The files it writes say `# GENERATED` at the top. Hand edits to them are lost on the next
sync — except `notes:`, which is the intended place for your own judgement. If you would
rather write the ratings yourself, just don't run this script; nothing else depends on it.

> **What the numbers are.** A unit's average placement is the average of the boards it
> appeared on, not a measurement of the unit: a 5-cost that shows up in games already won
> reads better than it plays. Treat a synced list as a first draft.

### Daily automation — GitHub Actions

`.github/workflows/sync-meta.yml` runs `pnpm sync:meta --seed` and then `pnpm sync:bis` every day at
03:00 UTC (10:00 Bangkok). You can also run it by hand from the Actions tab (**Run workflow**). If anything under
`data/curated/` changed, `github-actions[bot]` commits `chore(auto): daily meta and bis sync`
to `main`, and that push redeploys Vercel. A no-op run commits nothing and still passes.

It needs these repository secrets (Settings → Secrets and variables → Actions):
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `REVALIDATE_SECRET`.
`SITE_URL` and `REVALIDATE_SECRET` are for revalidation only. Without them the seed still lands, and the redeploy refreshes the pages.

### Cache revalidation

Both scripts POST to `/api/revalidate` after writing, so the live pages update on the next request instead of waiting out the one-day `cacheLife`. This needs `SITE_URL` in `.env.local`:

```
SITE_URL=https://tft-compstat.vercel.app
```

Empty `SITE_URL` skips revalidation with a warning — the write still lands, the site just serves the old copy for up to a day. To revalidate a local `next start` instead, override it for the one run:

```bash
SITE_URL=http://localhost:3000 pnpm seed:curated
```

---

## Riot sync operations

There are four ways into `SyncService`, and **all four pass through the same lock and cooldown gate**:

| Trigger | Where | Notes |
|---|---|---|
| Daily cron | `GET /api/cron/sync` | `vercel.json`, 04:17 UTC. The only trigger that also refreshes rank/profile. |
| Refresh button | `refreshMyMatches()` Server Action on `/me` | Shows a live cooldown countdown. |
| Stale-on-read | `after()` on `/me` | Fires after the response has flushed. |
| Local | `pnpm riot:sync` | Same gate, same limiter. |

```bash
pnpm riot:sync                    # one sync, trigger "manual"
pnpm riot:sync --trigger cron     # also refreshes the profile and rank

pnpm riot:backfill --dry-run      # report which of the last N ids are missing
pnpm riot:backfill --count 200    # walk deeper history (bypasses the lock on purpose)
pnpm riot:backfill --start 100    # begin deeper in the list

pnpm rederive --dry-run           # recompute player_matches from matches.raw — 0 Riot calls
pnpm rederive --all               # every row
```

Use `pnpm rederive` after changing `derive.ts`, `comp-signature.ts` or `patches.ts`: the raw match JSON is cached, so derivation changes never cost API calls.

**Expected costs**, from the Phase 4 verification — useful as a baseline when something looks wrong:

| Situation | Calls | Time |
|---|---|---|
| First sync, 20 matches | 22 | 14.6s |
| No new games | 2 | 1.5s |
| Cron, no new games | 3 | 4.6s |
| Inside the cooldown | 0 | 0.3s (skipped) |

A full 20-match sync used 3 of 100 calls in Riot's 120s window, so there is wide headroom.

---

## Verifying the cron

The endpoint accepts **only** `Authorization: Bearer $CRON_SECRET`, compared with `timingSafeEqual` over the whole header. No header, a wrong token, or the right secret under the wrong scheme all return 401.

PowerShell:

```powershell
$secret = (Select-String -Path .env.local -Pattern '^CRON_SECRET=(.+)$').Matches.Groups[1].Value.Trim('"')
Invoke-RestMethod -Uri 'https://tft-compstat.vercel.app/api/cron/sync' -Headers @{ Authorization = "Bearer $secret" }
```

bash:

```bash
source .env.local
curl -s -H "Authorization: Bearer $CRON_SECRET" https://tft-compstat.vercel.app/api/cron/sync
```

Confirm the negative case too — it should print 401:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://tft-compstat.vercel.app/api/cron/sync
```

**Reading the response.** The route always returns HTTP 200 for an authorized call: a rate limit or an expired key is a reported outcome, not a failed cron, and a non-2xx would only make Vercel retry into the same wall. So read the JSON body, not the status:

| Body | Meaning |
|---|---|
| `{ok: true, newMatches: N, calls: N, nextAllowedAt}` | Healthy. |
| `{skipped: true, reason: "locked-or-cooling", nextAllowedAt}` | Normal inside the cooldown window. Not an error. |
| `{ok: false, ...}` with a key message | See [Rotating the Riot API key](#rotating-the-riot-api-key-personal-key). |
| `503 No tracked account` | `riot_accounts` is empty — run `pnpm riot:setup`. |

**Scheduled runs:** Vercel dashboard → the project → **Cron Jobs** shows the last run and its status; **Logs** filtered to `/api/cron/sync` shows the body. Hobby runs cron once a day, which is also what keeps the Supabase free tier from auto-pausing.

Because a healthy no-op run costs 3 calls and 4.6s, the simplest daily health check is: does `/me` show a "synced" badge rather than a warning banner.

---

## Rotating the Riot API key (Personal key)

Phase 4 and 5 ran on a **development key, which expires every 24 hours**. Every day it has expired, the cron fails and `/me` shows *"Riot API key invalid or expired — showing cached data."* A **Personal key does not expire**, which is the whole reason to apply.

When Riot approves the Personal key:

### 1. Replace it in both places

The key lives in exactly two places. It is read only by `riotEnv().RIOT_API_KEY` in [`src/lib/env.ts`](src/lib/env.ts), and consumed by [`src/lib/sync/sync-service.ts`](src/lib/sync/sync-service.ts), [`scripts/riot-setup.ts`](scripts/riot-setup.ts) and [`scripts/riot-backfill.ts`](scripts/riot-backfill.ts). **No code change is needed** — same `RGAPI-…` format, same variable name.

1. **Local** — `.env.local`, the `RIOT_API_KEY=` line. (`.env.local` is gitignored; never commit a key.)
2. **Vercel** — Project → **Settings → Environment Variables → `RIOT_API_KEY` → Edit**. Apply it to **Production, Preview and Development** so `vercel dev` and preview builds don't keep the dead key.

### 2. Redeploy — this is the step people miss

Vercel injects environment variables when a deployment starts. **Editing the variable does not change the running deployment.** Until you redeploy, production keeps using the old key.

Vercel dashboard → **Deployments** → the current production deployment → **⋯ → Redeploy**. Leave *"Use existing Build Cache"* on; nothing in the source changed.

### 3. Verify, and why there is no downtime

The swap is zero-downtime by construction, not by luck: **pages never call Riot**, so even a completely dead key leaves every route serving cached Supabase data. The redeploy itself is atomic — Vercel promotes the new deployment only once it is built and ready, and the old one keeps serving until that moment.

Verify in this order:

```bash
# 1. The key itself, locally — probes Riot, writes nothing.
pnpm riot:setup --dry-run

# 2. A real local sync through the full gate.
pnpm riot:sync

# 3. Production, after the redeploy has finished.
curl -s -H "Authorization: Bearer $CRON_SECRET" https://tft-compstat.vercel.app/api/cron/sync
```

Step 3 should return `{ok: true, ...}`. If it returns `{skipped: true, reason: "locked-or-cooling"}`, that is success too — step 2 just consumed the cooldown. Wait out `nextAllowedAt` and retry, or trust step 2.

Finally, load `/me` and confirm the warning banner is gone and the sync badge reads "synced *n*m ago". `sync_state.status` clears itself on the next successful sync; there is nothing to reset by hand.

> `pnpm riot:setup` without `--dry-run` is only needed if the **Riot ID or platform** changes, not for a key swap — the puuid is unchanged.

---

## Regions and latency

Phase 5 verification measured a ~0.15s TTFB but a 1.1–1.7s full stream from Thailand, against 0.95s locally, and suspected a region mismatch. **That was correct.** Measured 2026-09-12:

| Component | Region | Evidence |
|---|---|---|
| Vercel functions | was **`iad1`** — us-east-1, Washington D.C. | `x-vercel-id: sin1::iad1::…` on `/api/cron/sync`. `sin1` is the entry PoP; `iad1` is where the function ran. |
| Supabase Postgres | **`ap-northeast-2`** — Seoul | `db.<ref>.supabase.co` resolves into `2406:da12::/36`, which AWS publishes as `ap-northeast-2`. |

`iad1` is simply Vercel's default for new projects; it was never chosen. So **every Supabase query from a page render crossed the Pacific** — roughly 180–200ms per round trip, and `/me` makes several. That was the missing half-second, and it was network time, not render time.

Vercel's `icn1` is `ap-northeast-2` — the *same AWS region* as the database. Hobby allows a single function region, set in `vercel.json`, so the alignment is a one-line change — **applied 2026-09-12**:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["icn1"],
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "17 4 * * *"
    }
  ]
}
```

This helps **both** legs at once, which is what makes it unambiguous:

- function → Supabase falls from ~180ms to low single-digit ms per round trip, since they land in one AWS region;
- client → function falls from ~230ms (Thailand → Washington) to ~60–80ms (Thailand → Seoul).

Nothing gets worse. The prerendered static shells for `/`, `/comps` and `/tiers/*` are served from the CDN PoP nearest the viewer regardless of function region, so the ~0.15s TTFB is unaffected.

**Steps:**

1. Edit `vercel.json` as above.
2. `pnpm build` to confirm the config parses, then commit and push to `main`.
3. After the deploy, re-measure the region:
   ```bash
   curl -s -D - -o /dev/null https://tft-compstat.vercel.app/api/cron/sync | grep -i x-vercel-id
   ```
   It should read `<pop>::icn1::…`.
4. Time the full stream:
   ```bash
   curl -s -o /dev/null -w '%{time_starttransfer} %{time_total}\n' https://tft-compstat.vercel.app/me
   ```

### Measured result (2026-09-12, from Thailand)

`x-vercel-id` now reads `sin1::icn1::…`. Five samples per route, warm CDN cache:

| Route | TTFB before → after | Full stream before → after |
|---|---|---|
| `/me` | ~0.15s → **0.13–0.15s** (unchanged) | 1.1–1.7s → **0.46–0.57s** |
| `/` | ~0.15s → **0.13–0.15s** (unchanged) | ~1.07s → **0.39–0.56s** |
| `/api/cron/sync` (authorized, no-op) | — | 4.6s → **1.02s** |

TTFB is unchanged exactly as predicted — the static shell never depended on the function region. The full stream is now comfortably **inside the "under ~1s" Phase 5 target** from a remote client, which it previously missed by about half a second.

**Measure on a warm cache.** The first request to each route after any deploy regenerates the shell and reports an inflated TTFB (0.5–1.0s here). Hit each route once and discard it, or you will misread a cold cache as a regression.

> `sin1` (Singapore) is the alternative — ~30ms from Thailand — but it leaves a Singapore↔Seoul hop to the database on every query. `icn1` is the better trade, because the database round trips outnumber the single client round trip. Moving the *Supabase* project instead would mean recreating it, which is far more work for the same result.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/me` banner: "Riot API key invalid or expired" | Development key past its 24h | [Rotate the key](#rotating-the-riot-api-key-personal-key) |
| `/me` banner: "Rate limited by Riot" | 429; partial data was kept | None needed. It retries on the next sync; `next_allowed_at` holds Riot's `Retry-After`. |
| Refresh button appears to do nothing | Inside the cooldown | The countdown on the button shows the remaining time. |
| Cron returns 401 | Wrong or missing `CRON_SECRET`, or a non-`Bearer` scheme | Compare `.env.local` with the Vercel variable; remember a change needs a redeploy. |
| Cron returns 503 | `riot_accounts` is empty | `pnpm riot:setup` |
| Seed exits 1 with `file:line:col` | A bad reference in YAML | Working as intended — fix the file. Nothing was written. |
| Live pages show stale curated content | `SITE_URL` empty during the seed | Set it and re-run the seed, or wait out the one-day `cacheLife`. |
| Riot calls fail against a dead host | Riot consolidated the shard | `pnpm riot:setup --dry-run` asks Riot which shard the account is on and reports a disagreement. `th2` → `sg2` happened in 2026-09. |
| Stats look wrong after a logic change | `player_matches` derived by old code | `pnpm rederive --all` — costs no API calls. |
| `pnpm install` fails on build scripts | pnpm 12 blocks unapproved scripts | `pnpm-workspace.yaml` already lists `esbuild: false`; don't remove it. |

---

## Reference

### Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm check` | typecheck + lint + test |
| `pnpm db:push` / `db:types` | Apply migrations / regenerate types |
| `pnpm sync:static` | CommunityDragon → static tables |
| `pnpm seed:curated` | YAML → tier lists and comps |
| `pnpm sync:meta` | MetaTFT ranked stats → the two tier-list YAML files, and the generated comps |
| `pnpm sync:bis` | MetaTFT unit builds → `champion-bis.yaml` |
| `pnpm riot:setup` | Riot ID → puuid; probe routing; seed `riot_accounts` + `sync_state` |
| `pnpm riot:sync` | One sync locally |
| `pnpm riot:backfill` | Deeper history |
| `pnpm rederive` | Recompute `player_matches` from cached raw JSON |

Most accept `--dry-run`. Scripts run under `tsx --conditions=react-server --env-file-if-exists=.env.local`: the condition lets them import `server-only` modules, and the flag loads `.env.local` while letting shell variables win.

### Environment variables

All nine are set locally in `.env.local` and on Vercel, except `SITE_URL`, which is set only locally and as a GitHub Actions secret. The full table is in [architecture §10](context/architecture.md). `src/lib/env.ts` validates **per scope** and lazily, so a seed script never needs a Riot key; it also rejects swapped Supabase keys and never echoes a value in an error message.

| Var | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — read client |
| `SUPABASE_SERVICE_ROLE_KEY` | server — writes, sync, private tables |
| `RIOT_API_KEY` | server |
| `RIOT_GAME_NAME`, `RIOT_TAG_LINE`, `RIOT_PLATFORM` | server — `sg2` for this account |
| `CRON_SECRET` | server — cron auth |
| `REVALIDATE_SECRET` | server — seed scripts → cache revalidation |
| `SITE_URL` | local scripts and GitHub Actions, optional |

**Any change to a Vercel variable needs a redeploy to take effect.**

### Current deployment

| | |
|---|---|
| Site | https://tft-compstat.vercel.app |
| Supabase project | `ulpapntggzqipodxtwzb` — `ap-northeast-2`, Seoul |
| Vercel function region | `icn1` — Seoul, same AWS region as Supabase (see [Regions and latency](#regions-and-latency)) |
| Tracked account | `BurdenInMyHand#6969` on `sg2` |
| Set | 18 "Enchanted Wilds" — 36 traits, 74 champions, 771 items |
| Cron | daily, 04:17 UTC |
