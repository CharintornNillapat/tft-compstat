<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TFT CompStat — agent conventions

- **`AGY_LOG.md` is the session log.** Read it before starting; append an entry for every finished task using the template at the top of that file. Repo-relative paths only.
- **`context/architecture.md` and `context/roadmap.md` are the plan and the data contracts.** Keep them current in the same change.
- Commits that complete a logged task carry the trailer `AGY-Task: <N>`, so the log never has to be amended afterwards just to paste a SHA.
- Gates before handing work back: `pnpm check` (typecheck + lint + test + knip) and `pnpm build`.

Full detail in `CLAUDE.md`.
