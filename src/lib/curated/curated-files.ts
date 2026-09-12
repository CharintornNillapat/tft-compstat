import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Reading the curated files that are **not** seeded — the patch brief and the
 * stage-2 openers (architecture §7). Both ship inside the deployment and are
 * parsed during prerender, so both need the same "which set folder is live" walk.
 */

/**
 * Every read below joins this **literal** prefix, which is what keeps the build's
 * file tracing scoped: given a path built from `process.cwd()` alone, Turbopack
 * cannot tell what it will resolve to and traces the entire project into the
 * server bundle. A static prefix narrows that to this one small folder.
 */
export const CURATED_DIR = "data/curated";
const curatedPath = (...parts: string[]) => path.join(process.cwd(), "data", "curated", ...parts);

/**
 * `name` from the newest set folder that has it, with the repo-relative path for
 * error messages. Sets only ever go up, so the highest number is the live one —
 * and dropping in `data/curated/19/<name>` hands the card over without touching
 * any code. Returns null when no set folder has the file at all.
 */
export async function readNewestCuratedFile(name: string): Promise<{ file: string; text: string } | null> {
  let entries;
  try {
    entries = await readdir(curatedPath(), { withFileTypes: true });
  } catch {
    return null;
  }
  const setIds = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .sort((a, b) => b - a);

  for (const setId of setIds) {
    try {
      const text = await readFile(curatedPath(String(setId), name), "utf8");
      return { file: `${CURATED_DIR}/${setId}/${name}`, text };
    } catch {
      continue;
    }
  }
  return null;
}
