-- Phase 6 Task 20: ability and item text for the tooltips (architecture §4.2, §4.8, §9).
--
-- Written by `pnpm sync:static` from MetaTFT's per-set lookup, the one source with
-- Set 18's values resolved: CommunityDragon ships ability text with its numbers
-- stripped and no description at all for the `DA_` items. That lookup is a PBE build,
-- so every row records `text_source` ('pbe') and the tooltip says where its numbers
-- came from.
--
-- No grants or RLS below: privileges on public.champions and public.items are
-- table-level, so new columns inherit them, and their "Public read" policies are
-- unchanged. Same reasoning as 20260913120000_trait_descriptions.sql.

alter table public.champions
  add column ability_name text,
  add column ability_text text,
  add column text_source  text;

alter table public.items
  add column description text,
  add column stats       text,
  add column text_source text;

comment on column public.champions.ability_name is
  'Ability name from MetaTFT''s lookup. Null when no lookup unit matches the champion.';
comment on column public.champions.ability_text is
  'Ability text with every value resolved per star level ("465 / 700 / 1000"). Null when a value does not resolve.';
comment on column public.champions.text_source is
  'Where ability_text came from: MetaTFT''s _metadata.patch, e.g. ''pbe''. Null when there is no text.';
comment on column public.items.description is
  'Item description with values resolved. Null when the lookup has none or a value does not resolve.';
comment on column public.items.stats is
  'Base stats line, e.g. "150 Health · 10 AP". Null when the lookup has none.';
comment on column public.items.text_source is
  'Where description and stats came from: MetaTFT''s _metadata.patch, e.g. ''pbe''. Null when there is neither.';
