# Antigravity Task Log (AGY_LOG)

A chronological record of engineering tasks, feature implementations, and system enhancements executed on the TFT CompStat project.

---

## Task 26 — Redesigned Comps Toolbar & Multi-Metric Sorting (`/comps`)
* **Scope:** UI / UX Redesign & Client-Side Sorting Engine
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Pure Sorting Engine ([`src/lib/curated/comp-sort.ts`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/lib/curated/comp-sort.ts)):**
     - Implemented `sortComps()` supporting sort keys: `"tier" | "avg" | "top4" | "pick"`.
     - Natural sort defaults:
       - `tier`: `"asc"` (S → A → B → C)
       - `avg`: `"asc"` (3.90 → 4.50, lowest/best avg placement first)
       - `top4`: `"desc"` (65% → 45%, highest top-4 finish rate first)
       - `pick`: `"desc"` (15% → 1%, highest play rate first)
     - Comps with unrecorded or null stats are always placed at the end of the list regardless of direction.
     - Deterministic multi-tier tiebreaking: tier order (`S > A > B > C`) → `sortOrder` → alphabetical `name`.
  2. **Active Column Visual Feedback ([`src/components/comp-stats.tsx`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/components/comp-stats.tsx)):**
     - Added `highlightField?: CompStatField` prop to `CompStatsRow`.
     - When sorting by `avg`, `top4`, or `pick`, the corresponding stat in every comp card is highlighted with `text-accent font-bold` and an accent background pill (`bg-accent/10 px-1 -mx-1 text-accent`).
  3. **Toolbar Layout Redesign ([`src/components/comp-list.tsx`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/components/comp-list.tsx)):**
     - Structured two-row toolbar:
       - **Row 1:** Search input (`type="search"`, preserving `/` global shortcut) + comp count (`X of Y comps`) + one-click `Reset filters` button when search, filters, or custom sorts are active.
       - **Row 2:** Labeled uppercase control bars (`Tier`, `Style`, `Sort`) with top border separation (`border-t border-line/60 pt-2`), wrapping naturally on mobile (390px) and desktop (960px+) without horizontal overflow.
     - Interactive sort buttons toggle direction on repeat clicks, show direction SVG arrows (`↑` / `↓`), and include full ARIA accessibility attributes and tooltips.
  4. **Verification & Tests:**
     - Created unit test suite in [`src/lib/curated/comp-sort.test.ts`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/lib/curated/comp-sort.test.ts) (5/5 tests passing).
     - `pnpm check` (546 tests, 0 lint errors, 0 type errors), `pnpm build` (Next.js 16.3 static prerender), `pnpm dlx knip` (0 findings).

---

## Task 25 — Automated Opener Sync Pipeline
* **Commit:** `4ffd1e6` — *feat(openers): automate stage-2 opener derivation from live meta clusters*
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Automated Derivation Engine ([`src/lib/curated/openers-sync.ts`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/lib/curated/openers-sync.ts)):**
     - Pure algorithm clustering 24–28 live meta comps by common 1- and 2-cost `early_units`.
     - Ranks clusters by best comp tier and aggregated pick rate to select top stage-2 boards.
     - Derives trait-based board names (e.g. "Elderwood Rapidfires", "Blossom Juggernauts") and aggregates priority slammable completed items.
     - Maps active target comp slugs with fallback backfilling to guarantee minimum pivot counts, and generates concise role-aware gameplay notes (≤96 characters).
  2. **Validation Decoupling ([`src/lib/curated/opener-validation.ts`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/lib/curated/opener-validation.ts)):**
     - Isolated `validateOpeners` schema checks so CLI tools and test suites can run without `server-only` or Next.js cache dependencies.
  3. **CLI Script ([`scripts/sync-openers.ts`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/scripts/sync-openers.ts)):**
     - Added `pnpm sync:openers [--dry-run]` to derive, validate, and write `data/curated/<setId>/openers.yaml`.
  4. **CI/CD Integration ([`.github/workflows/sync-meta.yml`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/.github/workflows/sync-meta.yml)):**
     - Integrated opener derivation into the daily scheduled workflow after `sync:bis`, ensuring opener boards update continuously alongside live meta comps, gated by `pnpm build`.
  5. **Verification & Tests:**
     - 15 unit tests in [`src/lib/curated/openers-sync.test.ts`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/lib/curated/openers-sync.test.ts).

---

## Task 24 — Real Meta Opener Boards
* **Commit:** `1eada0e` — *feat(data): replace placeholder openers with real meta-derived stage-2 boards*
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Data-Derived Stage-2 Boards ([`data/curated/18/openers.yaml`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/data/curated/18/openers.yaml)):**
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
  1. **Real Patch 18.2 Notes ([`data/curated/18/meta-notes.yaml`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/data/curated/18/meta-notes.yaml)):**
     - Populated real Patch 18.2 balance takeaways (buffs: Ashe, Kennen, Rageblade, Elder Dragon; nerfs: Draven, Malphite, Kraken's Fury, Ahri; adjustments: Fast 9 XP, Elderwood, Thief's Gloves).
  2. **"Adjusted" Category:**
     - Extended `metaNotesFileSchema` to support an `adjustments` section (≤6 entries, ≤48 characters).
     - Styled with `--color-adjust: #38bdf8` token, diamond glyph (`◆`), and responsive 3-column desktop layout ([`src/app/meta-brief.tsx`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/app/meta-brief.tsx)).
  3. **Visual Entity Icons:**
     - Mini 16px portraits (`ChampionIcon` with cost border), item icons (`ItemIcon`), and trait icons rendered directly inside brief badges, auto-detected or explicitly defined via YAML entity tags.
  4. **Performance & Caching:**
     - Cached with `cacheTag("static")` and `cacheLife("days")`, resolving champion/item icons from `getStaticNames()`.

---

## Task 22 — Overview & Comp Guide Polish
* **Commit:** `c1f39f4` — *feat(ui): overview and comp guide polish (traits, pivot carries, augment tooltips)*
* **Date:** 2026-09-16
* **Changes Delivered:**
  1. **Top Comps Key Traits ([`src/app/top-comps.tsx`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/app/top-comps.tsx)):**
     - Rendered top 3 active traits (`comp.traits.slice(0, 3)`) with `TraitHex` and count badges beside `CompStatsRow`.
  2. **Opener Pivot Carry Cues ([`src/app/overview-openers.tsx`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/app/overview-openers.tsx)):**
     - Added 16px cost-bordered `ChampionIcon` for target comps' primary carry inside transition pills.
  3. **Rich Augment Tooltips in Guides ([`src/components/comp-augments.tsx`](file:///C:/Users/MRmar/Desktop/Mid%20years%20projects/TFT-CompStat/src/components/comp-augments.tsx)):**
     - Built interactive `CompAugmentsList` client island using shared `useHoverTip` and `AugmentDetails`, replacing static `title` attributes with rich tier, rarity, and effect descriptions.
