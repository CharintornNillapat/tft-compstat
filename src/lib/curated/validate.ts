import { isNode, LineCounter, parseDocument } from "yaml";
import { TIER_RANKS, type CompStyle, type TierRank } from "@/lib/static/game";
import { compFileSchema, TIER_LIST_FILES, tierListFileSchema, type TierListKind } from "./schemas";

/**
 * Curated YAML → validated, DB-ready tier lists and comps (architecture §7 steps 1–3).
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
  champions: ReadonlyMap<string, { name: string; setId: number; traits: readonly string[] }>;
  items: ReadonlyMap<string, { name: string; grantsTrait: string | null }>;
  traits: ReadonlyMap<string, { name: string }>;
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

export type SeedCompUnit = {
  apiName: string;
  row: number;
  col: number;
  star: number;
  isCarry: boolean;
  items: string[];
};

export type SeedComp = {
  file: string;
  slug: string;
  setId: number;
  patch: string;
  name: string;
  tier: TierRank;
  style: CompStyle;
  difficulty: number | null;
  summary: string | null;
  guide: string | null;
  sortOrder: number;
  isPublished: boolean;
  earlyUnits: string[];
  flexUnits: string[];
  units: SeedCompUnit[];
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
export function parseYaml(file: string, text: string) {
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

/** Why `apiName` isn't a champion of `setId`, or undefined when it is. */
export function championProblem(apiName: string, setId: number, index: ReferenceIndex): string | undefined {
  const champion = index.champions.get(apiName);
  if (champion && champion.setId === setId) return undefined;
  if (champion) return `${apiName} is a set ${champion.setId} champion, but this file is in the set ${setId} folder`;
  const setChampions = [...index.champions].filter(([, c]) => c.setId === setId);
  return `unknown set ${setId} champion "${apiName}"${didYouMean(apiName, setChampions)}`;
}

/** Why `apiName` isn't a stored item, or undefined when it is. Any set's items are allowed. */
export function itemProblem(apiName: string, index: ReferenceIndex): string | undefined {
  return index.items.has(apiName) ? undefined : `unknown item "${apiName}"${didYouMean(apiName, index.items)}`;
}

/** The trait an emblem would give `champion`, when the champion (or an earlier emblem) already has it. */
function wastedEmblem(champion: string, heldTraits: ReadonlySet<string>, item: string, index: ReferenceIndex) {
  const trait = index.items.get(item)?.grantsTrait;
  if (!trait || !heldTraits.has(trait)) return undefined;
  const traitName = index.traits.get(trait)?.name ?? trait;
  const championName = index.champions.get(champion)?.name ?? champion;
  return `${championName} is already ${traitName}, so ${index.items.get(item)!.name} adds nothing`;
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
      const problem = kind === "item" ? itemProblem(apiName, index) : championProblem(apiName, setId, index);
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

/**
 * One `comps/<slug>.yaml`. Beyond the schema: the slug matches the file name, every
 * unit and item exists, units and hexes are unique on the board, at least one unit
 * is a carry, no emblem goes to a unit that already has its trait, and flex units
 * are swaps rather than units already on the board.
 */
export function validateComp(input: {
  /** Repo-relative path, used in issues. */
  file: string;
  text: string;
  setId: number;
  index: ReferenceIndex;
}): { comp?: SeedComp; issues: SeedIssue[] } {
  const { file, setId, index } = input;
  const yaml = parseYaml(file, input.text);
  if (yaml.syntaxIssues.length) return { issues: yaml.syntaxIssues };

  const parsed = compFileSchema.safeParse(yaml.data);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => yaml.issue(issue.path, issue.message)) };
  }
  const data = parsed.data;
  const issues: SeedIssue[] = [];

  const fileSlug = file.split("/").at(-1)!.replace(/\.ya?ml$/, "");
  if (data.slug !== fileSlug) {
    issues.push(yaml.issue(["slug"], `is "${data.slug}", but the file is named ${fileSlug}; they must match`));
  }

  const unitAt = new Map<string, string>();
  const hexAt = new Map<string, string>();
  data.board.forEach((unit, i) => {
    const path = ["board", i];
    const firstAt = unitAt.get(unit.unit);
    if (firstAt) {
      issues.push(yaml.issue([...path, "unit"], `${unit.unit} is already on the board at ${firstAt}`));
    } else {
      unitAt.set(unit.unit, formatPath(path));
    }

    const hex = `${unit.row},${unit.col}`;
    const takenBy = hexAt.get(hex);
    if (takenBy) {
      issues.push(yaml.issue([...path, "col"], `row ${unit.row}, col ${unit.col} is already taken by ${takenBy}`));
    } else {
      hexAt.set(hex, `${unit.unit} at ${formatPath(path)}`);
    }

    const problem = championProblem(unit.unit, setId, index);
    if (problem) issues.push(yaml.issue([...path, "unit"], problem));
    const heldTraits = new Set(problem ? [] : index.champions.get(unit.unit)!.traits);
    unit.items.forEach((item, j) => {
      const itemIssue = itemProblem(item, index) ?? (problem ? undefined : wastedEmblem(unit.unit, heldTraits, item, index));
      if (itemIssue) issues.push(yaml.issue([...path, "items", j], itemIssue));
      const granted = index.items.get(item)?.grantsTrait;
      if (granted) heldTraits.add(granted);
    });
  });
  if (!data.board.some((unit) => unit.carry)) {
    issues.push(yaml.issue(["board"], "needs at least one carry: mark its main damage dealer with carry: true"));
  }

  for (const key of ["early_units", "flex_units"] as const) {
    const listedAt = new Map<string, string>();
    data[key].forEach((apiName, i) => {
      const path = [key, i];
      const firstAt = listedAt.get(apiName);
      if (firstAt) {
        issues.push(yaml.issue(path, `${apiName} is already listed at ${firstAt}`));
        return;
      }
      listedAt.set(apiName, formatPath(path));
      const problem = championProblem(apiName, setId, index);
      if (problem) issues.push(yaml.issue(path, problem));
      else if (key === "flex_units" && unitAt.has(apiName)) {
        issues.push(yaml.issue(path, `${apiName} is already on the board at ${unitAt.get(apiName)}; flex units are swaps`));
      }
    });
  }

  if (issues.length) return { issues };
  return {
    issues,
    comp: {
      file,
      slug: data.slug,
      setId,
      patch: data.patch,
      name: data.name,
      tier: data.tier,
      style: data.style,
      difficulty: data.difficulty ?? null,
      summary: data.summary ?? null,
      guide: data.guide ?? null,
      sortOrder: data.order,
      isPublished: data.published,
      earlyUnits: data.early_units,
      flexUnits: data.flex_units,
      units: data.board.map((unit) => ({
        apiName: unit.unit,
        row: unit.row,
        col: unit.col,
        star: unit.star,
        isCarry: unit.carry,
        items: unit.items,
      })),
    },
  };
}

/** Checks across files: comp slugs are unique across every set folder. */
export function checkCompSet(comps: readonly SeedComp[]): SeedIssue[] {
  const bySlug = new Map<string, string>();
  return comps.flatMap((comp): SeedIssue[] => {
    const other = bySlug.get(comp.slug);
    if (other) return [{ file: comp.file, path: "slug", message: `"${comp.slug}" is also used by ${other}` }];
    bySlug.set(comp.slug, comp.file);
    return [];
  });
}
