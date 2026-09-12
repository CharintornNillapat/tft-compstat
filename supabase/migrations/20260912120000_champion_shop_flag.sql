-- Non-shop playable units (architecture §11). Source of truth: context/architecture.md §4.2, §4.8.
--
-- Set 18 fields ten playable units that never appear in the shop: the Riftbeast
-- monsters and Elder Dragon. sync-static used Riot's Data Dragon shop list as a
-- hard filter, so those rows were missing entirely — curated comps could not field
-- them and Phase 4 derivation could not resolve their character_id to a cost.
--
-- The Data Dragon list becomes a flag instead of a filter: every unit with a cost
-- of 1–5 and at least one trait is stored, and units Data Dragon omits are marked
-- is_shop_unit = false. Summons proper are still excluded upstream by the
-- cost-and-traits test (legacy TFT_* summons carry no traits).
--
-- No grants or RLS below: privileges on public.champions are table-level, so the
-- new column inherits them, and the table's "Public read" policy is unchanged.

alter table public.champions
  add column is_shop_unit boolean not null default true;

comment on column public.champions.is_shop_unit is
  'False for playable units that are not buyable in the shop (Set 18 Riftbeasts, Elder Dragon).';
