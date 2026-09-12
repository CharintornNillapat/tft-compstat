import "server-only";
import { cacheLife } from "next/cache";
import { readNewestCuratedFile } from "./curated-files";
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

  const found = await readNewestCuratedFile(META_NOTES_FILE);
  if (!found) return null;

  const { file, text } = found;
  const { brief, issues } = parseMetaBrief(file, text);
  if (!brief) {
    throw new Error(`Invalid ${file}:\n${issues.map((issue) => `  ${formatIssue(issue)}`).join("\n")}`);
  }
  return brief;
}
