# Antigravity Task Log (AGY_LOG)

The handoff record for this project: what was done, what it touched, and what is still open. `context/roadmap.md` is the plan; this file is what actually happened. A cold `agy` session or agent should be able to resume from the newest entry alone.

## Conventions

Newest entry first. One entry per finished task, in this template — **every field is required**, and `Not done` says "nothing outstanding" rather than being dropped:

```markdown
## Task N — Title
* **AGY-Task:** N
* **Date:** YYYY-MM-DD
* **Roadmap:** context/roadmap.md Task N
* **Scope:** one line
* **Changes Delivered:** …
* **Gates:** check NNN/NNN · build NN/NN routes · knip 0 · route shapes unchanged
* **Not done:** … or "nothing outstanding"
* **Deployed:** yes / no
```

- **Repo-relative paths only** — `src/components/tier-row.tsx`, never `file:///C:/…`. Absolute paths are dead links for every other machine and on GitHub.
- **No `Commit:` field.** The work commit carries the trailer `AGY-Task: N` instead, so `git log --grep "^AGY-Task: N"` resolves it forever and a rebase can't stale it. This replaces the old habit of a second `docs(agy):` commit just to paste a SHA.
- **Tick the matching `context/roadmap.md` task in the same change**, so the log and the plan cannot drift.
- Entries before Task 29 predate this template and keep their original shape.

---

## Task 30 — Curated Comp Matching & `/me` at Phone Width
* **AGY-Task:** 30
* **Date:** 2026-09-16
* **Roadmap:** context/roadmap.md Task 30
* **Scope:** Milestone B — build architecture §6.2 step 4 (match played boards against the curated comps and report the record on each), make `/me` comfortable at 400px, and confirm the revalidation secrets Task 29 found empty are now wired.
* **Changes Delivered:**
  1. **Curated comp matching ([`src/lib/stats/curated-match.ts`](src/lib/stats/curated-match.ts), pure, 12 tests in [`src/lib/stats/curated-match.test.ts`](src/lib/stats/curated-match.test.ts)):**
     - A board matches a curated comp when it fielded **≥60% of that comp's board units**. `early_units` and `flex_units` are excluded deliberately — early units are a stage-2 holder the comp expects you to sell and flex units are alternatives, so counting either would make "you played this comp" easier to claim the *less* of it you actually built.
     - The share is of the comp's core, **not** of the board, so padding a board can never dilute a match. Matching is set-scoped. An equal overlap goes to the comp with **more** core units, otherwise a 4-unit comp would win every board that happened to contain it.
     - Unlike `comp-signature.ts` this is **unversioned**: nothing it produces is stored, so the threshold can move without a `derived_version` bump or a re-derive.
  2. **The data path ([`src/lib/curated/queries.ts`](src/lib/curated/queries.ts), [`src/lib/stats/queries.ts`](src/lib/stats/queries.ts)):** `getCuratedCompShapes()` returns slug, name, tier, set and board names only — four fields and ~10 api names a comp — cached under the `comps` tag. Deliberately not `getComps()`, whose icons, items, traits, stats and guides must not cross to the browser. `getDashboardData()` awaits it alongside its live reads; the matching itself runs in the browser on every filter change, like the rest of `src/lib/stats`.
  3. **Two new pieces of UI ([`src/components/me-curated-comps.tsx`](src/components/me-curated-comps.tsx)):** `MeCuratedComps`, the per-comp record (games, average placement, top 4) with a tier badge, a link to each guide and a footer counting matched games; and `CuratedCompTag`, which marks a history row with the comp it came closest to. The tag **prints the share whenever it is under 100%**, so a 71% match reads as the guess it is rather than as a stated fact (architecture §6.4).
     - Kept as a second table beside `MeFavoriteComps` rather than a column on it: that one groups by `comp_key` — *what the board was* — while this groups by *what it was going for*. One game is usually both.
  4. **`/me` at 400px:**
     - [`src/components/me-match-history.tsx`](src/components/me-match-history.tsx): a row keeps placement, carry and comp name on one line and folds the trailing metadata (trait hexes, level, queue, time) onto a second line under the name below `sm`. It was one `flex-wrap` row of seven items, which at 400px broke in the middle and put the traits under the placement pill. Desktop is unchanged — still one dense line.
     - [`src/components/me-favorite-comps.tsx`](src/components/me-favorite-comps.tsx) and the new table are both `table-fixed` with the three numeric columns pinned narrow and the label truncating. **This removed the favorite-comps table's `min-w-[20rem]` horizontal scroller**, the one part of the site a phone had to scroll sideways; the figures are 2-4 characters, so there was nothing to scroll to.
     - [`src/app/me/me-header.tsx`](src/app/me/me-header.tsx): LP and its delta are one `whitespace-nowrap` group (a bare wrap put "+18" alone on a line, a number with nothing to attach it to), the delta carries an `aria-label`, the Riot ID truncates instead of pushing the status off screen, and panels drop to `p-2.5` under `sm`. [`src/components/refresh-button.tsx`](src/components/refresh-button.tsx) grows to `py-1.5` on a phone, where it is a thumb target rather than a pointer one.
  5. **Docs:** architecture §6.2 gained a "Step 4, as built" block, §6.3 the `CuratedCompStat` contract and the two-tables reasoning, §9 a `/me` at phone width block and the component map entry; [`context/roadmap.md`](context/roadmap.md) ticks the Phase 5 line that left this "deliberately out of scope" and records Task 30.
* **Gates:** check 589/589 across 50 test files (up from 577/49) · lint 0 · types 0 · knip 0 · build 42/42 routes with the fetch cache cleared · route shapes unchanged (`/me` still Partial Prerender, 1d / 1w).
* **Verified against real data (`next start`, 18 ranked Set 18 games):**
  - **13 of 18 games matched a curated comp.** Riftbeast Malphite 4 games / 6.25 avg / 25% top 4; Draven Fast 9 2 / 1.00 / 100%; Elderwood Kayle 2 / 2.00 / 100%; Sprykin Teemo 2 / 2.50 / 100%; then three single games. The first row is a real finding about the account's play, which is the whole point of the feature.
  - **Layout, headless Edge at 400px and 960px:** neither width scrolls horizontally (`scrollWidth === clientWidth`), and nothing crosses the viewport edge at 960px. The only remaining `scrollWidth > clientWidth` elements are `truncate` spans doing their job, the pre-existing 3px sparkline wrapper and the nav strip's own scroller.
  - **Revalidation secrets (item 3, and Task 29's open finding):** **wired and proven.** Production returns 401 for a wrong secret and `{"revalidated":["static"]}` for the real one. The `sync-meta.yml` runs since the secrets were set — [35106510756](https://github.com/CharintornNillapat/tft-compstat/actions/runs/35106510756) and [35108479646](https://github.com/CharintornNillapat/tft-compstat/actions/runs/35108479646), both green — log `Revalidated "static"` and `Revalidated "tiers, comps"` with no skip warning, where Task 29's run logged the warning twice.
* **Not done:**
  - **Matching is carry-blind.** A Hecarim board matched *Vanguard Kha'Zix* at 71% because it shared 5 of that comp's 7 units. That is the documented cost of the pure unit-overlap rule architecture §6.2 specifies, and the printed share is what keeps it honest; making the comp's carry count would be a change to that contract rather than a bug fix, so it was not made unasked.
  - **No test covers `getCuratedCompShapes()` itself** — it is a Supabase read of the same shape as its neighbours in that file, and the suite has no database.
  - **The 60% threshold is a constant, not a control.** A player cannot ask "what if I count 50%?" without an edit.
  - Still open from Task 29: no `if: failure()` notification on `sync-meta.yml`; the set rollover guard's throw path has no live rehearsal or unit test; `is_shop_unit` is dead (architecture §4.8); `CONTEXT.md` and `docs/adr/` named by `CLAUDE.md` do not exist.
  - Nothing else outstanding.
* **Rebased onto `origin/main` (2026-09-17)** over three `chore(auto)` sync commits — the manual run above plus the scheduled 03:00 UTC one — with no conflicts. Gates re-run on the rebased tree: check 589/589, knip 0, build 42/42 with the fetch cache cleared, route shapes unchanged. Those syncs also re-seeded the curated comps, so the figures above were **re-measured against the new boards and are unchanged**: still 13 of 18, same seven comps, same averages.
* **Deployed:** no — committed on `main` and left unpushed for review.

---

## Task 29 — Pipeline Hardening & AGY Conventions
* **AGY-Task:** 29
* **Date:** 2026-09-16
* **Roadmap:** context/roadmap.md Task 29
* **Scope:** Close the pipeline-reliability and DX gaps from the 2026-09-16 audit — automate static sync, stop the site printing patch labels it cannot back up, make data staleness visible, and pin the AGY workflow down in the repo.
* **Changes Delivered:**
  1. **Static sync in the daily workflow ([`.github/workflows/sync-meta.yml`](.github/workflows/sync-meta.yml)):**
     - `pnpm sync:static` now runs **before** `sync:meta`. Every step after it validates `api_name`s against the champions/traits/items tables, so a patch that added a unit or an item previously had it skipped as an unknown name and silently dropped from the tier lists and `/bis` until someone ran the sync by hand — a failure mode [`README.md`](README.md) already described and nothing enforced.
     - Workflow renamed to "Sync static, meta, BIS, and openers".
  2. **Set rollover guard ([`scripts/sync-static.ts`](scripts/sync-static.ts)):**
     - New `--allow-set-rollover` flag. The script reads `tft_sets.is_active` before writing and throws when the live game data names a different set, printing both and what to run. A dry run reports the rollover instead of throwing.
     - The workflow deliberately does **not** pass the flag: a new set has no `data/curated/<setId>/` folder, so flipping `is_active` unattended would leave `/comps`, `/tiers` and `/bis` prerendering an empty site. The refusal is the alarm.
  3. **No literal patch fallbacks (architecture §6.4):**
     - [`src/lib/curated/header-meta.ts`](src/lib/curated/header-meta.ts) rewritten: dropped `?? "Set 18"`, `?? "Patch 18.2"` and the `try`/`catch` that swallowed real read failures. Every `HeaderMetaData` field is nullable and comes from real data — set from `tft_sets.is_active`, patch from the brief then the seeded tier list. [`src/components/header-meta-pill.tsx`](src/components/header-meta-pill.tsx) renders nothing when there is neither.
     - [`scripts/sync-openers.ts`](scripts/sync-openers.ts) dropped `?? "18.2"` and now throws naming the two syncs to run instead.
  4. **Visible data staleness:**
     - `getCuratedFreshness()` ([`src/lib/curated/queries.ts`](src/lib/curated/queries.ts)): a one-row read of `tier_lists.updated_at`, tagged `tiers`, rather than pulling `getChampionTierList()` and its joins onto every route.
     - [`src/components/meta-freshness.ts`](src/components/meta-freshness.ts) (pure, 6 tests in [`src/components/meta-freshness.test.ts`](src/components/meta-freshness.test.ts)) and the client island [`src/components/meta-freshness-dot.tsx`](src/components/meta-freshness-dot.tsx). The age is computed in the browser because the pill prerenders into the static shell — a server-rendered "2h ago" would freeze at build time. Grey/unknown before hydration and with nothing seeded, green and pulsing under 24h, amber and still beyond it with a visible `3d old` label so colour is not the only channel. Re-checks each minute.
     - New `--color-stale` token in [`src/app/globals.css`](src/app/globals.css).
  5. **Patch cross-check test ([`src/lib/curated/patch-consistency.test.ts`](src/lib/curated/patch-consistency.test.ts)):** asserts every curated file of the newest set folder names the same patch, and that `PATCH_RELEASES`' newest entry for that set matches it. Catches the three-way divergence between the MetaTFT feed, the hand-written `meta-notes.yaml` and [`src/lib/sync/patches.ts`](src/lib/sync/patches.ts) that used to go silent on patch day.
  6. **`knip` in the standard gate:** added as a devDependency with a `knip` script, and `check` is now `typecheck && lint && test && knip` ([`package.json`](package.json)) instead of an ad-hoc `pnpm dlx knip` that got logged inconsistently.
  7. **AGY conventions in the repo:** [`CLAUDE.md`](CLAUDE.md) gained a "Session log" section and [`AGENTS.md`](AGENTS.md) a conventions block — `AGY_LOG.md` is the session log, entries use the template now at the top of this file, paths are repo-relative, and the work commit carries an `AGY-Task: <N>` trailer so no second commit is needed to record a SHA. All 31 machine-local `file:///C:/…` links in this file were converted to repo-relative.
* **Gates:** check 577/577 across 49 test files (up from 568/47) · lint 0 · types 0 · knip 0 · build 42/42 routes with the fetch cache cleared · route shapes unchanged (`/` and `/comps/[slug]` Partial Prerender; `/bis`, `/augments`, `/comps`, `/planner`, both tier lists Static).
* **Cloud verification (2026-09-16, after deploy):**
  - **CI** (`ci.yml`) green on `8114787` in 53s — `pnpm check` including `knip` and the two new test files, then `pnpm build` on a clean runner with no fetch cache.
  - **Vercel** production deploy `dpl_7PkBXfaCbeGkdXYukxrZw1mJcPqA` READY. Live HTML confirms the fix: the prerendered header ships `bg-faint` and "Meta data freshness unknown", **not** a green pulse, with the real age filled in on hydration. Pill reads "Set 18 · Patch 18.2" from real data.
  - **`sync-meta.yml` manual run** ([35103651723](https://github.com/CharintornNillapat/tft-compstat/actions/runs/35103651723)) green in 1m10s, all 12 steps. The new **Sync static game data** step wrote set 18 — 36 traits (origin 14 · class 12 · unique 10), 74 champions, 771 items, abilities 65 of 74 — matching architecture §4.8 exactly, with only the nine known Lux-form warnings. The rollover guard took its no-op path (active set 18 == live data set 18). The run then built and pushed `73ec1fa`, 28 files under `data/curated/`.
  - **The patch cross-check was exercised against real sync output**, not just the committed snapshot: after pulling `73ec1fa`, `patch-consistency.test.ts` is 3/3 green and all four curated files still read `18.2`.
* **Not done:**
  - **`SITE_URL` and `REVALIDATE_SECRET` are empty in the workflow environment** — found in this run's logs, which printed `SITE_URL:` blank and the skip warning twice ("the site's `static` cache was not revalidated"). Architecture §10 lists both as required repository secrets. The daily sync therefore never revalidates the live cache; it only refreshes because the auto-commit redeploys Vercel and `cacheLife("days")` expires. Pre-existing, unrelated to this task, and worth fixing — set the two repo secrets.
  - **The rollover guard's throw path has no live rehearsal.** This run proved the no-op path only; the throw needs real game data naming a new set. It has no unit test either — it is a script-level branch the suite does not reach.
  - **No failure notification.** `sync-meta.yml` still has no `if: failure()` step, so a failed daily run is only visible in the Actions tab. Flagged in the audit, not in this scope.
  - **`/augments` builds at 1d / 1w, not the 30d / 1y architecture §8 claimed.** Measured to be a Task 27 regression, not this one: `HeaderMetaPill` is in the root layout and its `cacheLife("days")` floors every route. Confirmed by rebuilding with the pill removed, which returned `/augments` to 30d / 1y. Kept deliberately and §8 corrected.
  - Still open from the audit: `is_shop_unit` is dead (architecture §4.8), and the `CONTEXT.md` / `docs/adr/` that `CLAUDE.md` names do not exist.
* **Deployed:** yes — 2026-09-16, commit `8114787` (trailer `AGY-Task: 29`), live on https://tft-compstat.vercel.app.

---

## Task 28 — Visual Polish, Arena HexBoard & Interactive Ergonomics (Phases B & C)
* **Commit:** `9db293a` — *feat(ui): implement hextech visual polish, trait cross-highlighting, and planner breakpoint helper (Phases B & C)*
* **Scope:** Hextech Visual Polish, Tier Glows, Arena HexBoard Styling, Trait Cross-Highlighting & Planner Breakpoint Helper
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Phase B — Visual Polish & Hextech Aesthetic:**
     - **Tier Glows & S-Tier Accent ([`src/components/tier-row.tsx`](src/components/tier-row.tsx), [`src/components/comp-list.tsx`](src/components/comp-list.tsx)):**
       - Enhanced `TIER_BG.S` with ambient glow `shadow-[0_0_10px_rgba(251,113,133,0.35)]` and `TIER_BG.A` with `shadow-[0_0_6px_rgba(251,146,60,0.2)]`.
       - Added accent left border and soft gradient to S-tier comp cards in `CompRow` (`border-l-2 border-l-tier-s bg-gradient-to-r from-tier-s/[0.04] to-transparent`).
     - **Augment Rarity Badges ([`src/components/augment-parts.tsx`](src/components/augment-parts.tsx)):**
       - Styled `RarityPill` with distinct glowing rarity borders (`Silver`, `Gold`, `Prismatic`) and color-coded interior indicator pips.
     - **HexBoard Arena Polish ([`src/components/hex-board.tsx`](src/components/hex-board.tsx), [`src/components/cost-styles.ts`](src/components/cost-styles.ts)):**
       - Redesigned `EmptyHex` into authentic dual-polygon recessed arena plates (`bg-surface/75` plate with central coordinate dots).
       - Added `COST_GLOW` with drop-shadows matching unit cost tiers (gray, green, blue, purple, amber) and hover elevation transition (`group-hover:scale-105`).
       - Supported `highlightedTrait` on `HexBoard`: matching units receive `scale-110 drop-shadow-[0_0_12px_rgba(200,170,110,0.9)] ring-2 ring-accent z-20`, while unrelated units dim with `opacity-30 grayscale-[65%]`.
     - **Copy Toast Feedback ([`src/components/copy-team-code-button.tsx`](src/components/copy-team-code-button.tsx)):**
       - Added visual feedback toast styling with buff glow (`border-buff/50 bg-buff/15 text-buff shadow-[0_0_12px_rgba(74,222,128,0.2)]`) and an inline `"Ready to paste in-game"` status pill badge.
  2. **Phase C — Interactive Ergonomics:**
     - **Trait Cross-Highlighting ([`src/components/comp-board-section.tsx`](src/components/comp-board-section.tsx), [`src/components/comp-traits.tsx`](src/components/comp-traits.tsx), [`src/components/comp-guide.tsx`](src/components/comp-guide.tsx)):**
       - Created client component `CompBoardSection` to manage synchronized hover state between `HexBoard` and `CompTraitList`.
       - Hovering or focusing any trait instantly highlights all fielded units that have that trait on the arena board. Includes an active indicator with a quick clear button.
     - **Champion Quick Filter on Comps ([`src/components/comp-list.tsx`](src/components/comp-list.tsx)):**
       - Extracted top 10 carry champions across all comps via `useMemo`.
       - Rendered interactive carry champion filter chips with champion portrait and cost border. Clicking a carry filters the comps down to those featuring that carry, clicking again clears.
     - **Planner Breakpoint Helper ([`src/lib/curated/traits.ts`](src/lib/curated/traits.ts), [`src/lib/curated/traits.test.ts`](src/lib/curated/traits.test.ts), [`src/components/planner/planner-app.tsx`](src/components/planner/planner-app.tsx)):**
       - Implemented `isOneAwayFromBreakpoint(trait)` helper determining if fielding 1 more unit activates or upgrades a trait.
       - Added 6 unit tests covering initial tiers, upgrades, maxed traits, unique traits, and empty breakpoints.
       - Enabled `showNearBreakpoints={true}` in `planner-app.tsx`, displaying an accent `+1 away` chip beside qualifying traits and tallying near-breakpoint traits in the panel title.
  3. **Verification & Checks:**
     - `pnpm check`: 47 test files passed (568/568 unit tests passing), 0 lint errors, 0 type errors.
     - `pnpm build`: Next.js 16.3.4 (Turbopack) successfully compiled and prerendered all 42 routes.

---

## Task 27 — Immediate Gaming Ergonomics & Speed (Search, Hotkey Badges, Header Meta)
* **Commit:** `a32874c` — *feat(ui): add instant search on bis/augments, hotkey badges, and header meta pill*
* **Scope:** UI / UX Enhancement, Instant Search, Hotkey Accessibility & Live Meta Header
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Instant Live Search on `/bis` ([`src/components/bis-board.tsx`](src/components/bis-board.tsx), [`src/lib/curated/bis-filter.ts`](src/lib/curated/bis-filter.ts)):**
     - Pure search algorithm matching champion names, roles, notes, completed items, components, and trait emblems.
     - Redesigned two-row toolbar matching `/comps`: search input with autofocus `/` hotkey, champion counter (`X of Y champions`), and one-click `Reset filters` button.
     - 8 unit tests in [`src/lib/curated/bis-filter.test.ts`](src/lib/curated/bis-filter.test.ts).
  2. **Instant Live Search on `/augments` ([`src/components/augment-board.tsx`](src/components/augment-board.tsx), [`src/lib/curated/augment-filter.ts`](src/lib/curated/augment-filter.ts)):**
     - Pure search algorithm filtering augments in milliseconds across name, description/effects (e.g. "reroll", "xp", "gold", "health"), and rarity.
     - Responsive toolbar with search bar, `<kbd>/</kbd>` shortcut badge, augment counter, and reset button.
     - 7 unit tests in [`src/lib/curated/augment-filter.test.ts`](src/lib/curated/augment-filter.test.ts).
  3. **Hotkey Badges (`<kbd>`) on Navigation & Search ([`src/components/nav-tabs.tsx`](src/components/nav-tabs.tsx), [`src/components/comp-list.tsx`](src/components/comp-list.tsx)):**
     - Subtle `<kbd>` badges (`1` to `8`) on navigation tabs for `sm:`+ screens (hidden on mobile phones to prevent tab clipping).
     - Dedicated `<kbd>/</kbd>` badge cleanly integrated inside the search bars on `/comps`, `/bis`, and `/augments`.
  4. **Shortcuts Cheatsheet Popover ([`src/components/shortcuts-help.tsx`](src/components/shortcuts-help.tsx), [`src/components/shortcut-match.ts`](src/components/shortcut-match.ts)):**
     - Added global `?` shortcut trigger and a compact `[ ⌨ Shortcuts ? ]` button in the header.
     - High-density cheatsheet popover showing all tab keys (`1`–`8`), search (`/`), help (`?`), and dismiss (`Esc`).
     - Unit test for `?` mapping in [`src/components/shortcut-match.test.ts`](src/components/shortcut-match.test.ts).
  5. **Header Meta Context Pill ([`src/components/header-meta-pill.tsx`](src/components/header-meta-pill.tsx), [`src/lib/curated/header-meta.ts`](src/lib/curated/header-meta.ts)):**
     - Ambient `Set 18 · Patch 18.2` pill with an animated emerald pulsating live sync dot beside the logo in [`src/components/site-header.tsx`](src/components/site-header.tsx).
     - Cached with `cacheTag("static")` and prerendered into the static shell.
  6. **Verification & Checks:**
     - `pnpm check` (562 tests passing, 0 lint errors, 0 type errors).
     - `pnpm build` (42/42 routes successfully prerendered with Turbopack).
     - `pnpm dlx knip` (0 unused dependencies, exports, or files).

---

## Task 26 — Redesigned Comps Toolbar & Multi-Metric Sorting (`/comps`)
* **Scope:** UI / UX Redesign & Client-Side Sorting Engine
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Pure Sorting Engine ([`src/lib/curated/comp-sort.ts`](src/lib/curated/comp-sort.ts)):**
     - Implemented `sortComps()` supporting sort keys: `"tier" | "avg" | "top4" | "pick"`.
     - Natural sort defaults:
       - `tier`: `"asc"` (S → A → B → C)
       - `avg`: `"asc"` (3.90 → 4.50, lowest/best avg placement first)
       - `top4`: `"desc"` (65% → 45%, highest top-4 finish rate first)
       - `pick`: `"desc"` (15% → 1%, highest play rate first)
     - Comps with unrecorded or null stats are always placed at the end of the list regardless of direction.
     - Deterministic multi-tier tiebreaking: tier order (`S > A > B > C`) → `sortOrder` → alphabetical `name`.
  2. **Active Column Visual Feedback ([`src/components/comp-stats.tsx`](src/components/comp-stats.tsx)):**
     - Added `highlightField?: CompStatField` prop to `CompStatsRow`.
     - When sorting by `avg`, `top4`, or `pick`, the corresponding stat in every comp card is highlighted with `text-accent font-bold` and an accent background pill (`bg-accent/10 px-1 -mx-1 text-accent`).
  3. **Toolbar Layout Redesign ([`src/components/comp-list.tsx`](src/components/comp-list.tsx)):**
     - Structured two-row toolbar:
       - **Row 1:** Search input (`type="search"`, preserving `/` global shortcut) + comp count (`X of Y comps`) + one-click `Reset filters` button when search, filters, or custom sorts are active.
       - **Row 2:** Labeled uppercase control bars (`Tier`, `Style`, `Sort`) with top border separation (`border-t border-line/60 pt-2`), wrapping naturally on mobile (390px) and desktop (960px+) without horizontal overflow.
     - Interactive sort buttons toggle direction on repeat clicks, show direction SVG arrows (`↑` / `↓`), and include full ARIA accessibility attributes and tooltips.
  4. **Verification & Tests:**
     - Created unit test suite in [`src/lib/curated/comp-sort.test.ts`](src/lib/curated/comp-sort.test.ts) (5/5 tests passing).
     - `pnpm check` (546 tests, 0 lint errors, 0 type errors), `pnpm build` (Next.js 16.3 static prerender), `pnpm dlx knip` (0 findings).

---

## Task 25 — Automated Opener Sync Pipeline
* **Commit:** `4ffd1e6` — *feat(openers): automate stage-2 opener derivation from live meta clusters*
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Automated Derivation Engine ([`src/lib/curated/openers-sync.ts`](src/lib/curated/openers-sync.ts)):**
     - Pure algorithm clustering 24–28 live meta comps by common 1- and 2-cost `early_units`.
     - Ranks clusters by best comp tier and aggregated pick rate to select top stage-2 boards.
     - Derives trait-based board names (e.g. "Elderwood Rapidfires", "Blossom Juggernauts") and aggregates priority slammable completed items.
     - Maps active target comp slugs with fallback backfilling to guarantee minimum pivot counts, and generates concise role-aware gameplay notes (≤96 characters).
  2. **Validation Decoupling ([`src/lib/curated/opener-validation.ts`](src/lib/curated/opener-validation.ts)):**
     - Isolated `validateOpeners` schema checks so CLI tools and test suites can run without `server-only` or Next.js cache dependencies.
  3. **CLI Script ([`scripts/sync-openers.ts`](scripts/sync-openers.ts)):**
     - Added `pnpm sync:openers [--dry-run]` to derive, validate, and write `data/curated/<setId>/openers.yaml`.
  4. **CI/CD Integration ([`.github/workflows/sync-meta.yml`](.github/workflows/sync-meta.yml)):**
     - Integrated opener derivation into the daily scheduled workflow after `sync:bis`, ensuring opener boards update continuously alongside live meta comps, gated by `pnpm build`.
  5. **Verification & Tests:**
     - 15 unit tests in [`src/lib/curated/openers-sync.test.ts`](src/lib/curated/openers-sync.test.ts).

---

## Task 24 — Real Meta Opener Boards
* **Commit:** `1eada0e` — *feat(data): replace placeholder openers with real meta-derived stage-2 boards*
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Data-Derived Stage-2 Boards ([`data/curated/18/openers.yaml`](data/curated/18/openers.yaml)):**
     - Replaced placeholder boards with 8 real Diamond+ meta openers from Set 18 Patch 18.2 comp clusters:
       - *Blossom Invokers* (S): Karma, Yorick, Yunara, Rakan
       - *Elderwood Vanguard* (S): Ornn, Alistar, Varus, Xayah
       - *Riftbeast Swarm* (S): Pebbles, Cinderling, Scuttlecrab, Yorick
       - *Sprykin Brawlers* (A): Kobuko, Rek'Sai, Teemo, Veigar
       - *Defender Snipers* (A): Camille, Caitlyn, Elise, Rakan
       - *Elderwood Defenders* (A): Ornn, Kayle, Leona, Xayah
       - *Inferno Hunters* (B): Varus, Akali, Shen, Ornn
       - *Lunar Rapidfire* (B): Alistar, Ornn, Varus, Shen
  2. **Schema & Static Conformance:**
     - Removed synthetic trait names and unviable pivots.
     - Verified all core units (1–2 cost), slammable items, and pivot comp slugs against static tables and published comps.

---

## Task 23 — Meta Brief Enhancements
* **Commits:** `d63abc6`, `2e87a6a` — *feat(ui): meta brief real notes, adjusted category, and visual entity icons*
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Real Patch 18.2 Notes ([`data/curated/18/meta-notes.yaml`](data/curated/18/meta-notes.yaml)):**
     - Populated real Patch 18.2 balance takeaways (buffs: Ashe, Kennen, Rageblade, Elder Dragon; nerfs: Draven, Malphite, Kraken's Fury, Ahri; adjustments: Fast 9 XP, Elderwood, Thief's Gloves).
  2. **"Adjusted" Category:**
     - Extended `metaNotesFileSchema` to support an `adjustments` section (≤6 entries, ≤48 characters).
     - Styled with `--color-adjust: #38bdf8` token, diamond glyph (`◆`), and responsive 3-column desktop layout ([`src/app/meta-brief.tsx`](src/app/meta-brief.tsx)).
  3. **Visual Entity Icons:**
     - Mini 16px portraits (`ChampionIcon` with cost border), item icons (`ItemIcon`), and trait icons rendered directly inside brief badges, auto-detected or explicitly defined via YAML entity tags.
  4. **Performance & Caching:**
     - Cached with `cacheTag("static")` and `cacheLife("days")`, resolving champion/item icons from `getStaticNames()`.

---

## Task 22 — Overview & Comp Guide Polish
* **Commit:** `c1f39f4` — *feat(ui): overview and comp guide polish (traits, pivot carries, augment tooltips)*
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Top Comps Key Traits ([`src/app/top-comps.tsx`](src/app/top-comps.tsx)):**
     - Rendered top 3 active traits (`comp.traits.slice(0, 3)`) with `TraitHex` and count badges beside `CompStatsRow`.
  2. **Opener Pivot Carry Cues ([`src/app/overview-openers.tsx`](src/app/overview-openers.tsx)):**
     - Added 16px cost-bordered `ChampionIcon` for target comps' primary carry inside transition pills.
  3. **Rich Augment Tooltips in Guides ([`src/components/comp-augments.tsx`](src/components/comp-augments.tsx)):**
     - Built interactive `CompAugmentsList` client island using shared `useHoverTip` and `AugmentDetails`, replacing static `title` attributes with rich tier, rarity, and effect descriptions.
