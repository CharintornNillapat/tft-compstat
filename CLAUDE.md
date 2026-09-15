@AGENTS.md

# TFT CompStat

- Plans and data contracts live in `context/architecture.md` and `context/roadmap.md`. Read them before changing anything and keep them current.
- Work phase by phase: start a roadmap phase only after explicit approval.
- Checks: `pnpm check` (typecheck + lint + test) and `pnpm build`.
- Migrations: `supabase/migrations/<timestamp>_name.sql`; every new table needs explicit grants + RLS (see the init migration footer).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default role labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`, with `context/` as the source of truth for plans and data contracts. See `docs/agents/domain.md`.
