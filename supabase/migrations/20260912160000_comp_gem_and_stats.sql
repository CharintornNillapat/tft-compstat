-- Phase 6 Task 2: sleeper flag, curated stats and carry priority (architecture §7, §9).
--
-- All of these are **author-supplied numbers from the curated YAML**, not anything
-- this site measures. Global win-rate aggregation is a non-goal (§0), so the columns
-- are nullable and a comp that omits them simply shows no stats.
--
-- Rates are stored as fractions (0.625), matching winRate/top4Rate in src/lib/stats,
-- while the YAML is authored in percent (62.5). validate.ts does the conversion.
--
-- No grants or RLS below: privileges on public.comps and public.comp_units are
-- table-level, so new columns inherit them, and both "Public read" policies are
-- unchanged. Same reasoning as 20260912120000_champion_shop_flag.sql.

alter table public.comps
  add column is_gem            boolean not null default false,
  add column avg_place         numeric(3,2) check (avg_place between 1 and 8),
  add column top4_rate         numeric(4,3) check (top4_rate between 0 and 1),
  add column pick_rate         numeric(4,3) check (pick_rate between 0 and 1),
  add column level_recommended smallint     check (level_recommended between 1 and 10);

comment on column public.comps.is_gem is
  'Sleeper pick: low pick rate but a high top-4 rate. Curated, not measured.';
comment on column public.comps.top4_rate is
  'Fraction 0-1, authored in the YAML as a percent. Curated, not measured.';

-- Item priority: who gets the components first. 1 = first, 3 = third.
alter table public.comp_units
  add column carry_priority smallint check (carry_priority between 1 and 3);

comment on column public.comp_units.carry_priority is
  'Item priority within the comp; 1 is built first. Null for units with no stated priority.';

-- The seed script already rejects a repeated priority with the file and line, which
-- is the error a human should see. This is the backstop that keeps the invariant true
-- for anything else that writes the table. Partial, so the many nulls do not collide.
create unique index comp_units_priority_idx
  on public.comp_units (comp_id, carry_priority)
  where carry_priority is not null;

-- Replaces the Phase 3 function to carry the new columns. Signature is unchanged, so
-- the existing service_role-only grant stays as it is (20260911180000_seed_comp.sql).
create or replace function public.seed_comp(p_comp jsonb, p_units jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_comp_id uuid;
begin
  insert into public.comps (
    slug, set_id, patch, name, tier, style, difficulty, summary, guide_md,
    early_units, flex_units, is_published, sort_order,
    is_gem, avg_place, top4_rate, pick_rate, level_recommended
  )
  select c.slug, c.set_id, c.patch, c.name, c.tier, c.style, c.difficulty, c.summary, c.guide_md,
         coalesce(c.early_units, '{}'), coalesce(c.flex_units, '{}'),
         coalesce(c.is_published, true), coalesce(c.sort_order, 0),
         coalesce(c.is_gem, false), c.avg_place, c.top4_rate, c.pick_rate, c.level_recommended
    from jsonb_populate_record(null::public.comps, p_comp) as c
  on conflict (slug) do update set
    set_id            = excluded.set_id,
    patch             = excluded.patch,
    name              = excluded.name,
    tier              = excluded.tier,
    style             = excluded.style,
    difficulty        = excluded.difficulty,
    summary           = excluded.summary,
    guide_md          = excluded.guide_md,
    early_units       = excluded.early_units,
    flex_units        = excluded.flex_units,
    is_published      = excluded.is_published,
    sort_order        = excluded.sort_order,
    is_gem            = excluded.is_gem,
    avg_place         = excluded.avg_place,
    top4_rate         = excluded.top4_rate,
    pick_rate         = excluded.pick_rate,
    level_recommended = excluded.level_recommended
  returning id into v_comp_id;

  -- Delete, then insert: inside one transaction, moved or swapped hexes never conflict.
  delete from public.comp_units where comp_id = v_comp_id;
  insert into public.comp_units (
    comp_id, champion_api_name, hex_row, hex_col, star_goal, is_carry, items, carry_priority
  )
  select v_comp_id, u.champion_api_name, u.hex_row, u.hex_col,
         coalesce(u.star_goal, 2), coalesce(u.is_carry, false), coalesce(u.items, '{}'),
         u.carry_priority
    from jsonb_populate_recordset(null::public.comp_units, p_units) as u;

  return v_comp_id;
end;
$$;
