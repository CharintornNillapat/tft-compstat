import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { META_NOTES_FILE, metaNotesFileSchema } from "./schemas";
import { formatIssue, parseYaml, type SeedIssue } from "./validate";

/**
 * The patch brief on `/` (architecture §7, §8). Unlike every other curated file,
 * this one is **not seeded**: it holds no `api_name`s, so there is nothing to check
 * against the static tables and nothing for the DB to add. It is read straight from
 * the repo during prerender instead, which keeps it off the request path entirely.
 */

export type MetaBrief = {
  patch: string;
  title: string;
  buffs: string[];
  nerfs: string[];
  tip: string | null;
};

/**
 * Every read below joins this **literal** prefix, which is what keeps the build's
 * file tracing scoped: given a path built from `process.cwd()` alone, Turbopack
 * cannot tell what it will resolve to and traces the entire project into the
 * server bundle. A static prefix narrows that to this one small folder.
 */
const CURATED_DIR = "data/curated";
const curatedPath = (...parts: string[]) => path.join(process.cwd(), "data", "curated", ...parts);

/** Pure: YAML text → a brief, or the issues that stopped it, with file:line:col. */
export function parseMetaBrief(file: string, text: string): { brief?: MetaBrief; issues: SeedIssue[] } {
  const yaml = parseYaml(file, text);
  if (yaml.syntaxIssues.length) return { issues: yaml.syntaxIssues };

  const parsed = metaNotesFileSchema.safeParse(yaml.data);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => yaml.issue(issue.path, issue.message)) };
  }
  const data = parsed.data;
  return {
    issues: [],
    brief: {
      patch: data.patch,
      title: data.title ?? `Patch ${data.patch} brief`,
      buffs: data.buffs,
      nerfs: data.nerfs,
      tip: data.tip ?? null,
    },
  };
}

/**
 * The newest set folder that has a brief. Sets only ever go up, so the highest
 * number is the live one — and dropping in `data/curated/19/meta-notes.yaml`
 * hands the card over without touching any code.
 */
async function readMetaNotesFile(): Promise<{ file: string; text: string } | null> {
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
      const text = await readFile(curatedPath(String(setId), META_NOTES_FILE), "utf8");
      return { file: `${CURATED_DIR}/${setId}/${META_NOTES_FILE}`, text };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * `cacheLife("max")` rather than the `"days"` the DB reads use: this file ships
 * inside the deployment, so only a new build can change it, and a new build id
 * already invalidates the entry. It is parsed once during prerender and never on
 * a request — hence no cache tag either, since nothing can revalidate it.
 *
 * A missing file returns null and the card simply doesn't render. A malformed one
 * **throws**, failing the build the way `seed:curated` aborts: repo-owned content
 * that no longer parses is a typo to fix, not a card to quietly blank out.
 */
export async function getMetaBrief(): Promise<MetaBrief | null> {
  "use cache";
  cacheLife("max");

  const found = await readMetaNotesFile();
  if (!found) return null;

  const { file, text } = found;
  const { brief, issues } = parseMetaBrief(file, text);
  if (!brief) {
    throw new Error(`Invalid ${file}:\n${issues.map((issue) => `  ${formatIssue(issue)}`).join("\n")}`);
  }
  return brief;
}
