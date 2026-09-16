-- Task 31 housekeeping: `champions.is_shop_unit`'s column comment still described the
-- rule 20260912120000_champion_shop_flag.sql shipped with — false for whatever Riot's
-- Data Dragon shop list omitted. Phase 6 Task 12 replaced that source (architecture
-- §4.8): sync-static no longer reads Data Dragon, every playable unit (cost 1-5, at
-- least one trait) is stored true, and nothing sets the column false today. The column
-- and its readers (`shopUnits` in the tier-list and BIS syncs, the reroll rule) stay
-- for a future set that actually has unbuyable units — this only corrects the comment
-- a `\d+ champions` or a generated-types read would otherwise show as current.
--
-- No grants, RLS or data change: this is DDL on a column comment only.

comment on column public.champions.is_shop_unit is
  'True for every playable unit (cost 1-5, at least one trait); Set 18 Riftbeasts included. '
  'Nothing sets this false today -- sync-static stopped reading Data Dragon''s shop list at '
  'Task 12, the only source that ever excluded a unit. A future set with real unbuyable '
  'units needs a new source before this can be false again.';
