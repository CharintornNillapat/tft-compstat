import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getStaticNames } from "@/lib/static/lookup";
import type { NameBook } from "@/lib/static/names";
import { readNewestCuratedFile } from "./curated-files";
import { META_NOTES_FILE, metaNotesFileSchema, type BriefEntryInput } from "./schemas";
import { formatIssue, parseYaml, type SeedIssue } from "./validate";

/**
 * The patch brief on `/` (architecture §7, §8). Read from the repo during
 * prerender and resolved against the cached static tables for champion, item,
 * and trait icons.
 */

export type BriefEntity =
  | { kind: "champion"; name: string; cost: number; iconUrl: string | null }
  | { kind: "item"; name: string; iconUrl: string | null }
  | { kind: "trait"; name: string; iconUrl: string | null };

export type BriefEntry = {
  text: string;
  entity?: BriefEntity;
};

export type MetaBrief = {
  patch: string;
  title: string;
  buffs: BriefEntry[];
  nerfs: BriefEntry[];
  adjustments: BriefEntry[];
  tip: string | null;
};

/** Resolves an entity (champion, item, trait) from explicit tags or text prefix. */
export function resolveBriefEntity(input: BriefEntryInput, names?: NameBook): BriefEntity | undefined {
  if (!names) return undefined;

  // 1. Explicit entity tag in entry object
  if (typeof input === "object") {
    if (input.champion) {
      const q = input.champion.toLowerCase();
      const found =
        names.champions[input.champion] ??
        Object.values(names.champions).find((c) => c.name.toLowerCase() === q || c.name.toLowerCase().startsWith(q));
      if (found) {
        return { kind: "champion", name: found.name, cost: found.cost, iconUrl: found.iconUrl };
      }
    }
    if (input.item) {
      const q = input.item.toLowerCase();
      const found =
        names.items[input.item] ??
        Object.values(names.items).find((i) => i.name.toLowerCase() === q || i.name.toLowerCase().startsWith(q));
      if (found) {
        return { kind: "item", name: found.name, iconUrl: found.iconUrl };
      }
    }
    if (input.trait) {
      const q = input.trait.toLowerCase();
      const found =
        names.traits[input.trait] ??
        Object.values(names.traits).find((t) => t.name.toLowerCase() === q || t.name.toLowerCase().startsWith(q));
      if (found) {
        return { kind: "trait", name: found.name, iconUrl: found.iconUrl };
      }
    }
  }

  // 2. Auto-detect from text prefix
  const text = typeof input === "string" ? input : input.text;
  const lowerText = text.toLowerCase();

  // Champions (longest first)
  const champList = Object.values(names.champions).sort((a, b) => b.name.length - a.name.length);
  for (const champ of champList) {
    if (champ.name.length >= 3) {
      const champLower = champ.name.toLowerCase();
      if (
        lowerText.startsWith(champLower) &&
        (lowerText.length === champLower.length || /[\s—\-:,.★]/.test(lowerText[champLower.length] ?? ""))
      ) {
        return { kind: "champion", name: champ.name, cost: champ.cost, iconUrl: champ.iconUrl };
      }
    }
  }

  // Items (longest first)
  const itemList = Object.values(names.items).sort((a, b) => b.name.length - a.name.length);
  for (const item of itemList) {
    if (item.name.length >= 4) {
      const itemLower = item.name.toLowerCase();
      if (
        lowerText.startsWith(itemLower) &&
        (lowerText.length === itemLower.length || /[\s—\-:,.★]/.test(lowerText[itemLower.length] ?? ""))
      ) {
        return { kind: "item", name: item.name, iconUrl: item.iconUrl };
      }
    }
  }

  // Traits (longest first)
  const traitList = Object.values(names.traits).sort((a, b) => b.name.length - a.name.length);
  for (const trait of traitList) {
    if (trait.name.length >= 4) {
      const traitLower = trait.name.toLowerCase();
      if (
        lowerText.startsWith(traitLower) &&
        (lowerText.length === traitLower.length || /[\s—\-:,.★]/.test(lowerText[traitLower.length] ?? ""))
      ) {
        return { kind: "trait", name: trait.name, iconUrl: trait.iconUrl };
      }
    }
  }

  return undefined;
}

/** Pure: YAML text → a brief, or the issues that stopped it, with file:line:col. */
export function parseMetaBrief(
  file: string,
  text: string,
  names?: NameBook,
): { brief?: MetaBrief; issues: SeedIssue[] } {
  const yaml = parseYaml(file, text);
  if (yaml.syntaxIssues.length) return { issues: yaml.syntaxIssues };

  const parsed = metaNotesFileSchema.safeParse(yaml.data);
  if (!parsed.success) {
    return { issues: parsed.error.issues.map((issue) => yaml.issue(issue.path, issue.message)) };
  }
  const data = parsed.data;

  const toEntry = (input: BriefEntryInput): BriefEntry => {
    const text = typeof input === "string" ? input : input.text;
    const entity = resolveBriefEntity(input, names);
    return entity ? { text, entity } : { text };
  };

  return {
    issues: [],
    brief: {
      patch: data.patch,
      title: data.title ?? `Patch ${data.patch} brief`,
      buffs: data.buffs.map(toEntry),
      nerfs: data.nerfs.map(toEntry),
      adjustments: data.adjustments.map(toEntry),
      tip: data.tip ?? null,
    },
  };
}

/**
 * Prerendered and cached with `cacheTag("static")` + `cacheLife("days")`,
 * resolving champion and item icons from static data.
 *
 * A missing file returns null and the card simply doesn't render. A malformed one
 * **throws**, failing the build the way `seed:curated` aborts.
 */
export async function getMetaBrief(): Promise<MetaBrief | null> {
  "use cache";
  cacheTag("static");
  cacheLife("days");

  const found = await readNewestCuratedFile(META_NOTES_FILE);
  if (!found) return null;

  const { names } = await getStaticNames();
  const { file, text } = found;
  const { brief, issues } = parseMetaBrief(file, text, names);
  if (!brief) {
    throw new Error(`Invalid ${file}:\n${issues.map((issue) => `  ${formatIssue(issue)}`).join("\n")}`);
  }
  return brief;
}
