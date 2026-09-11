import { isNode, LineCounter, parseDocument } from "yaml";
import { TIER_RANKS, type TierRank } from "@/lib/static/game";
import { TIER_LIST_FILES, tierListFileSchema, type TierListKind } from "./schemas";

/**
 * Curated YAML → validated, DB-ready tier lists (architecture §7 steps 1–2).
 * Pure: the seed script supplies file text and the reference index from the DB.
 * Every issue names the file, line and YAML path so a typo is quick to find.
 */

export type SeedIssue = {
  file: string;
  /** YAML path like `tiers.S[3]`; empty for whole-file problems. */
  path: string;
  message: string;
  line?: number;
  col?: number;
};

/** What curated files may reference, loaded from the static tables. */
export type ReferenceIndex = {
  champions: ReadonlyMap<string, { name: string; setId: number }>;
  items: ReadonlyMap<string, { name: string }>;
};

export type SeedTierList = {
  file: string;
  slug: string;
  kind: TierListKind;
  setId: number;
  patch: string;
  title: string;
  summary: string | null;
  isCurrent: boolean;
  entries: { tier: TierRank; position: number; apiName: string; note: string | null }[];
};

const DEFAULT_TITLES: Record<TierListKind, string> = {
  champion: "Champion tier list",
  item: "Item tier list",
};

/** `["tiers", "S", 3]` → `tiers.S[3]` */
export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, i) => (typeof key === "number" ? `[${key}]` : `${i ? "." : ""}${String(key)}`))
    .join("");
}

export function formatIssue({ file, line, col, path, message }: SeedIssue): string {
  const where = line ? `${file}:${line}:${col}` : file;
  return `${where}  ${path ? `${path}: ` : ""}${message}`;
}

/** Parses YAML and returns an issue builder that points at the value's line. */
function parseYaml(file: string, text: string) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });

  const locate = (path: readonly PropertyKey[]) => {
    // A missing key has no node of its own: point at the closest parent that exists.
    for (let depth = path.length; depth >= 0; depth--) {
      const node = depth === 0 ? doc.contents : doc.getIn(path.slice(0, depth), true);
      if (isNode(node) && node.range) return lineCounter.linePos(node.range[0]);
    }
    return undefined;
  };

  const issue = (path: readonly PropertyKey[], message: string): SeedIssue => ({
    file,
    path: formatPath(path),
    message,
    ...locate(path),
  });

  const syntaxIssues = doc.errors.map(
    (error): SeedIssue => ({
      file,
      path: "",
      message: `invalid YAML: ${error.message.split("\n")[0]}`,
      line: error.linePos?.[0].line,
      col: error.linePos?.[0].col,
    }),
  );

  return { data: syntaxIssues.length ? undefined : (doc.toJS() as unknown), issue, syntaxIssues };
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/**
 * Likely intended api names: same letters ignoring case and punctuation, a display
 * name ("Ashe" → DA_18_Ashe), or a near miss. Several exact matches are all returned
 * (items often exist as both `DA_…` and `TFT_Item_…`).
 */
export function suggestApiNames(
  input: string,
  candidates: Iterable<readonly [string, { name: string }]>,
): string[] {
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = key(input);
  const exact: string[] = [];
  let near: { apiName: string; distance: number } | undefined;
  for (const [apiName, { name }] of candidates) {
    if (key(apiName) === target || key(name) === target) {
      exact.push(apiName);
      continue;
    }
    const distance = levenshtein(target, key(apiName));
    if (distance <= Math.max(2, Math.floor(target.length / 5)) && (!near || distance < near.distance)) {
      near = { apiName, distance };
    }
  }
  return exact.length ? exact.slice(0, 3) : near ? [near.apiName] : [];
}

function didYouMean(input: string, candidates: Iterable<readonly [string, { name: string }]>): string {
  const suggestions = suggestApiNames(input, candidates);
  return suggestions.length ? `. Did you mean ${suggestions.join(" or ")}?` : "";
}

function referenceProblem(
  kind: TierListKind,
  apiName: string,
  setId: number,
  index: ReferenceIndex,
): string | undefined {
  if (kind === "item") {
    return index.items.has(apiName) ? undefined : `unknown item "${apiName}"${didYouMean(apiName, index.items)}`;
  }
  const champion = index.champions.get(apiName);
  if (champion && champion.setId === setId) return undefined;
  if (champion) return `${apiName} is a set ${champion.setId} champion, but this file is in the set ${setId} folder`;
  const setChampions = [...index.champions].filter(([, c]) => c.setId === setId);
  return `unknown set ${setId} champion "${apiName}"${didYouMean(apiName, setChampions)}`;
}

export function validateTierList(input: {
  /** Repo-relative path, used in issues. */
  file: string;
  text: string;
  setId: number;
  kind: TierListKind;
  index: ReferenceIndex;
}): { list?: SeedTierList; issues: SeedIssue[] } {
  const { file, setId, kind, index } = input;
  const yaml = parseYaml(file, input.text);
  if (yaml.syntaxIssues.length) return { issues: yaml.syntaxIssues };

  const parsed = tierListFileSchema.safeParse(yaml.data);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => yaml.issue(issue.path, issue.message)) };
  }
  const data = parsed.data;
  const issues: SeedIssue[] = [];

  if (data.kind !== kind) {
    issues.push(yaml.issue(["kind"], `is "${data.kind}", but ${TIER_LIST_FILES[kind]} holds ${kind} tiers`));
  }

  const listedAt = new Map<string, string>();
  const entries: SeedTierList["entries"] = [];
  for (const tier of TIER_RANKS) {
    (data.tiers[tier] ?? []).forEach((apiName, position) => {
      const path = ["tiers", tier, position];
      const first = listedAt.get(apiName);
      if (first) {
        issues.push(yaml.issue(path, `${apiName} is already listed at ${first}`));
        return;
      }
      listedAt.set(apiName, formatPath(path));
      const problem = referenceProblem(kind, apiName, setId, index);
      if (problem) issues.push(yaml.issue(path, problem));
      entries.push({ tier, position, apiName, note: data.notes[apiName] ?? null });
    });
  }
  if (listedAt.size === 0) issues.push(yaml.issue(["tiers"], "lists no entries"));
  for (const apiName of Object.keys(data.notes)) {
    if (!listedAt.has(apiName)) issues.push(yaml.issue(["notes", apiName], `${apiName} is not in any tier`));
  }

  if (issues.length) return { issues };
  return {
    issues,
    list: {
      file,
      slug: data.slug,
      kind,
      setId,
      patch: data.patch,
      title: data.title ?? DEFAULT_TITLES[kind],
      summary: data.summary ?? null,
      isCurrent: data.current,
      entries,
    },
  };
}

/** Checks across files: slugs are unique and each kind has at most one current list. */
export function checkTierListSet(lists: readonly SeedTierList[]): SeedIssue[] {
  const issues: SeedIssue[] = [];
  const bySlug = new Map<string, string>();
  const currentByKind = new Map<TierListKind, string>();
  for (const list of lists) {
    const slugFile = bySlug.get(list.slug);
    if (slugFile) issues.push({ file: list.file, path: "slug", message: `"${list.slug}" is also used by ${slugFile}` });
    else bySlug.set(list.slug, list.file);

    if (!list.isCurrent) continue;
    const currentFile = currentByKind.get(list.kind);
    if (currentFile) {
      issues.push({
        file: list.file,
        path: "current",
        message: `${currentFile} is also the current ${list.kind} list; only one can be current`,
      });
    } else {
      currentByKind.set(list.kind, list.file);
    }
  }
  return issues;
}
