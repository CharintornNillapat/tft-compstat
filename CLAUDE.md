@AGENTS.md

# TFT CompStat

- Plans and data contracts live in `context/architecture.md` and `context/roadmap.md`. Read them before changing anything and keep them current.
- Work phase by phase: start a roadmap phase only after explicit approval.
- Checks: `pnpm check` (typecheck + lint + test) and `pnpm build`.
- Migrations: `supabase/migrations/<timestamp>_name.sql`; every new table needs explicit grants + RLS (see the init migration footer).
