-- Phase 6 Task 8: trait descriptions for the trait tooltip (architecture §4.8, §9).
--
-- Both columns are written by `pnpm sync:static` from CommunityDragon's trait `desc`
-- and `effects`, with every @Variable@ placeholder already resolved to a number, so
-- the site renders plain text and never parses client markup.
--
-- No grants or RLS below: privileges on public.traits are table-level, so new
-- columns inherit them, and its "Public read" policy is unchanged. Same reasoning
-- as 20260912160000_comp_gem_and_stats.sql.

alter table public.traits
  add column description text,
  add column effects     jsonb not null default '[]'::jsonb;

comment on column public.traits.description is
  'The trait''s general text, without its per-breakpoint rows. Null when the source has none.';
comment on column public.traits.effects is
  'Per-breakpoint bonus text, [{ "min": 3, "text": "..." }] sorted by min. Empty when the source has no rows.';
