-- Phase 3: atomic comp writes for scripts/seed-curated.ts (architecture §4.9, §7 step 5).
--
-- supabase-js has no transactions, and replacing a comp's units with upserts trips
-- unique (comp_id, hex_row, hex_col) whenever two units swap hexes. seed_comp()
-- upserts the comp by slug and replaces all of its units in one transaction instead,
-- so readers never see a half-written comp and the hex constraint stays as it is.
--
-- No new tables. Server-only like acquire_sync_lock: execute is granted to service_role alone.

create function public.seed_comp(p_comp jsonb, p_units jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_comp_id uuid;
begin
  insert into public.comps (
    slug, set_id, patch, name, tier, style, difficulty, summary, guide_md,
    early_units, flex_units, is_published, sort_order
  )
  select c.slug, c.set_id, c.patch, c.name, c.tier, c.style, c.difficulty, c.summary, c.guide_md,
         coalesce(c.early_units, '{}'), coalesce(c.flex_units, '{}'),
         coalesce(c.is_published, true), coalesce(c.sort_order, 0)
    from jsonb_populate_record(null::public.comps, p_comp) as c
  on conflict (slug) do update set
    set_id       = excluded.set_id,
    patch        = excluded.patch,
    name         = excluded.name,
    tier         = excluded.tier,
    style        = excluded.style,
    difficulty   = excluded.difficulty,
    summary      = excluded.summary,
    guide_md     = excluded.guide_md,
    early_units  = excluded.early_units,
    flex_units   = excluded.flex_units,
    is_published = excluded.is_published,
    sort_order   = excluded.sort_order
  returning id into v_comp_id;

  -- Delete, then insert: inside one transaction, moved or swapped hexes never conflict.
  delete from public.comp_units where comp_id = v_comp_id;
  insert into public.comp_units (comp_id, champion_api_name, hex_row, hex_col, star_goal, is_carry, items)
  select v_comp_id, u.champion_api_name, u.hex_row, u.hex_col,
         coalesce(u.star_goal, 2), coalesce(u.is_carry, false), coalesce(u.items, '{}')
    from jsonb_populate_recordset(null::public.comp_units, p_units) as u;

  return v_comp_id;
end;
$$;

revoke execute on function public.seed_comp(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.seed_comp(jsonb, jsonb) to service_role;
