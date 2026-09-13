-- Phase 6 Task 15: a champion's in-client Team Planner id, for "Copy team code" on
-- /comps/[slug] (architecture §4.8, §9).
--
-- Written by `pnpm sync:static` from CommunityDragon's tftchampions-teamplanner.json
-- (`team_planner_code`). A team code is "02" + ten 3-hex-digit slots of these ids +
-- the set mutator, so the value must fit in three hex digits. Null for a unit the
-- planner does not list (Set 18: the nine Lux forms other than DA_Lux18_Base); the code skips it.
--
-- No grants or RLS below: privileges on public.champions are table-level, so a new
-- column inherits them, and its "Public read" policy is unchanged. Same reasoning
-- as 20260913180000_trait_kind.sql.

alter table public.champions
  add column team_planner_code smallint check (team_planner_code between 1 and 4095);

comment on column public.champions.team_planner_code is
  'Team Planner id (CommunityDragon team_planner_code), 1-4095. Null when the planner does not list the unit.';
