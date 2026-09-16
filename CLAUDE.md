@AGENTS.md

# TFT CompStat

- Plans and data contracts live in `context/architecture.md` and `context/roadmap.md`. Read them before changing anything and keep them current.
- **Session log: `AGY_LOG.md`.** Read it first — it is the running record of what was done, by whom, and what is still open. Append an entry for every task you finish, using the template at the top of that file. See "Session log" below.
- Work phase by phase: start a roadmap phase only after explicit approval.
- Checks: `pnpm check` (typecheck + lint + test + knip) and `pnpm build`.
- Migrations: `supabase/migrations/<timestamp>_name.sql`; every new table needs explicit grants + RLS (see the init migration footer).

## Session log

`AGY_LOG.md` is the handoff record for the `agy` CLI workflow and for any cold agent picking the project up mid-stream. `context/roadmap.md` stays the plan; `AGY_LOG.md` is what actually happened.

- **One entry per finished task**, in the template at the top of `AGY_LOG.md`. Every field is required — `Not done:` says "nothing outstanding" rather than being dropped.
- **Repo-relative paths only** (`src/components/tier-row.tsx`). Never `file:///C:/…`: those are dead for every other machine and on GitHub.
- **Tick the matching `context/roadmap.md` task in the same change.** The log and the roadmap drifting apart is what this convention exists to stop.
- **Do not commit twice to record a SHA.** End the work commit's message with the trailer:

  ```
  AGY-Task: 29
  ```

  `git log --grep "^AGY-Task: 29"` then resolves it forever, and survives a rebase that a pasted SHA would not. The log entry lands in the same commit as the work.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for this repo, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default role labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` plus `docs/adr/`, with `context/` as the source of truth for plans and data contracts. See `docs/agents/domain.md`.
