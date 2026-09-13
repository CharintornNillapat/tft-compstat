-- Phase 6 Task 9: a trait's type for the trait tooltip header (architecture §4.8, §9).
--
-- Written by `pnpm sync:static`. CommunityDragon and Data Dragon carry no trait type,
-- so it comes from MetaTFT's per-set lookup file; when that source is unavailable the
-- sync warns and leaves the column null, and the tooltip simply omits the line.
--
-- No grants or RLS below: privileges on public.traits are table-level, so a new
-- column inherits them, and its "Public read" policy is unchanged. Same reasoning
-- as 20260913120000_trait_descriptions.sql.

alter table public.traits
  add column kind text check (kind in ('origin', 'class', 'unique'));

comment on column public.traits.kind is
  'Origin, class or unique (one-unit) trait. Null when the sync had no source for it.';
