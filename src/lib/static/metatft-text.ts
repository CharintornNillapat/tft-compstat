import { z } from "zod";

/**
 * MetaTFT lookup markup → tooltip text (architecture §4.8). Pure.
 *
 * CommunityDragon ships Set 18's ability text with its numbers stripped (352
 * placeholders, none resolvable from `en_us.json`), and no `DA_` item carries a
 * description at all. MetaTFT's per-set lookup has both with every value resolved —
 * but only as a **PBE** build (`_metadata.patch: "pbe"`), which can lead live by a
 * patch, so each stored text records its source and the tooltip says so.
 *
 * Markup:
 * - `<TFTAttribute attributeId="…"/>` reads an ability's per-star `attributeValues`
 *   (index 0 is 1★), falling back to a footer entry that names the same attribute.
 *   `TFTSpellAttributes.*` / `TFTItemAttributes.*` are live in-game counters ("Gold
 *   generated this game: …"), and so is an unresolved attribute styled as rules text
 *   ("(Greens Foraged: …)"), so the line holding one is dropped. A tag with no
 *   attribute at all only draws a stat icon ("Adaptor <icon.AP>: …") and becomes its word.
 * - `<TFTCurveTable row="…"/>` reads step-wise `[star, value]` pairs from `curveValues`.
 * - `format` scales a value (percent, percentMinusOne, invertedPercent), `precision`
 *   fixes its decimals, and `icon` names the stat it scales with.
 * - Style tags (`<Keyword>`, `<Rules>`, `<bright>`, `<img/>`…) are dropped around their text,
 *   and so are string-table references only the client expands
 *   (`{Augment.Variant.RivalsAugment.AbilityTooltip}`).
 *
 * Any other unresolved value drops the whole text: a tooltip reading "deals ? damage"
 * is worse than none, the rule `augmentText` follows too.
 */

const curveValuesSchema = z.record(z.string(), z.array(z.array(z.number().nullable())));

export const lookupUnitSchema = z.object({
  apiName: z.string(),
  name: z.string().nullish(),
  cost: z.number().nullish(),
  shopUnit: z.boolean().nullish(),
  curveValues: curveValuesSchema.nullish(),
  ability: z
    .object({
      name: z.string().nullish(),
      desc: z.string().nullish(),
      attributeValues: z.record(z.string(), z.array(z.number().nullable())).nullish(),
      footer: z
        .array(z.object({ desc: z.string().nullish(), values: z.array(z.array(z.number().nullable())).nullish() }))
        .nullish(),
    })
    .nullish(),
});

export const lookupItemSchema = z.object({
  apiName: z.string(),
  desc: z.string().nullish(),
  statLine: z.string().nullish(),
  curveValues: curveValuesSchema.nullish(),
});

export type LookupUnit = z.infer<typeof lookupUnitSchema>;
export type LookupItem = z.infer<typeof lookupItemSchema>;
export type LookupAbilityText = { name: string; text: string };
export type LookupItemText = { description: string | null; stats: string | null };

/**
 * Entries that don't match the schema are skipped and counted, not fatal: a quirk in
 * one unit must not cost the trait types `sync:static` reads from the same file.
 */
export function parseLookupEntries<T>(schema: z.ZodType<T>, entries: readonly unknown[]): { parsed: T[]; skipped: number } {
  const parsed: T[] = [];
  for (const entry of entries) {
    const result = schema.safeParse(entry);
    if (result.success) parsed.push(result.data);
  }
  return { parsed, skipped: entries.length - parsed.length };
}

/**
 * The lookup unit for one of our champions. MetaTFT names units `TFT18_Ashe` where
 * CommunityDragon and match data say `DA_18_Ashe`, so they join on name and cost.
 * Two candidates (Set 18's lookup lists Elise twice) prefer the shop unit; anything
 * still ambiguous matches nothing rather than the wrong ability.
 */
export function matchLookupUnit(
  units: readonly LookupUnit[],
  champion: { name: string; cost: number },
): LookupUnit | undefined {
  const same = units.filter((unit) => unit.name === champion.name && unit.cost === champion.cost);
  const pick = same.length > 1 ? same.filter((unit) => unit.shopUnit) : same;
  return pick.length === 1 ? pick[0] : undefined;
}

const STARS = [1, 2, 3] as const;

/** An ability's text with values for 1★ to 3★, or null when anything doesn't resolve. */
export function abilityText(unit: LookupUnit): LookupAbilityText | null {
  const { ability } = unit;
  const name = ability?.name?.trim();
  if (!name || !ability?.desc) return null;
  const text = markupToText(ability.desc, {
    stars: STARS,
    attributes: ability.attributeValues,
    curves: unit.curveValues,
    footer: ability.footer,
  });
  return text ? { name, text } : null;
}

/** An item's description and base stats. Items have one value per row, at key 1. */
export function itemText(item: LookupItem): LookupItemText {
  const scope: Scope = { stars: [1], curves: item.curveValues };
  return {
    description: item.desc ? markupToText(item.desc, scope) : null,
    stats: item.statLine ? statLineText(item.statLine, scope) : null,
  };
}

// ─── Markup ─────────────────────────────────────────────────────────────────

type Pairs = readonly (readonly (number | null)[])[];

type Scope = {
  stars: readonly number[];
  attributes?: Readonly<Record<string, readonly (number | null)[]>> | null;
  curves?: Readonly<Record<string, Pairs>> | null;
  footer?: readonly { desc?: string | null; values?: Pairs | null }[] | null;
};

type Resolved = { kind: "value"; text: string } | { kind: "counter" } | { kind: "miss" };

const VALUE_TAG = /<(TFTAttribute|TFTCurveTable)\b([^>]*)>/gi;
const RUNTIME_COUNTER = /^TFT(?:Spell|Item)Attributes\./;

/** Stat icons, lowercased without the `icon.` prefix, as the word the icon stands for. */
const ICON_WORDS: Record<string, string> = {
  ad: "AD",
  ap: "AP",
  as: "Attack Speed",
  armor: "Armor",
  mr: "MR",
  health: "Health",
  manaregen: "Mana Regen",
  critchance: "Crit Chance",
  critdmg: "Crit Damage",
  damageamp: "Damage Amp",
  omnivamp: "Omnivamp",
  dura: "Durability",
};

function tagAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [, key, value] of raw.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) attributes[key!.toLowerCase()] = value!;
  return attributes;
}

function iconWords(icon: string | undefined): string[] {
  return (icon ?? "")
    .split(",")
    .map((part) => ICON_WORDS[part.trim().toLowerCase().replace(/^icon\./, "")])
    .filter((word): word is string => Boolean(word));
}

/** Step lookup: the value of the last pair keyed at or below `star`. */
function curveAt(pairs: Pairs, star: number): number | undefined {
  let found: number | undefined;
  for (const [key, value] of [...pairs].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))) {
    if (typeof key === "number" && key <= star && typeof value === "number") found = value;
  }
  return found;
}

function allNumbers(values: readonly (number | null | undefined)[] | undefined): values is number[] {
  return values !== undefined && values.length > 0 && values.every((value) => typeof value === "number" && Number.isFinite(value));
}

/** "465 / 700 / 1000 (AD)", or one value when every star agrees. */
function renderValues(values: readonly number[], attributes: Record<string, string>): string {
  const format = attributes.format?.toLowerCase();
  const percent = format === "percent" || format === "p" || format === "percentminusone" || format === "invertedpercent";
  const precision = attributes.precision === undefined ? undefined : Number(attributes.precision);
  const parts = values.map((value) => {
    const scaled =
      format === "percentminusone" ? (value - 1) * 100 : format === "invertedpercent" ? (1 - value) * 100 : percent ? value * 100 : value;
    const number = precision !== undefined && Number.isInteger(precision) ? scaled.toFixed(precision) : String(Number(scaled.toFixed(2)));
    return `${number}${percent ? "%" : ""}`;
  });
  const text = parts.every((part) => part === parts[0]) ? parts[0]! : parts.join(" / ");
  const words = iconWords(attributes.icon).join(", ");
  if (attributes.type === "stat") return words ? `${text} ${words}` : text;
  if (attributes.parens !== undefined && attributes.parens !== "false") return `(${text}${words ? ` ${words}` : ""})`;
  return words ? `${text} (${words})` : text;
}

function resolveTag(tag: string, attributes: Record<string, string>, scope: Scope): Resolved {
  if (tag.toLowerCase() === "tftattribute") {
    const id = attributes.attributeid;
    // No attribute: the tag only draws a stat icon, as Adaptor units do for each mode.
    if (!id) return { kind: "value", text: iconWords(attributes.icon).join(", ") };
    if (RUNTIME_COUNTER.test(id)) return { kind: "counter" };
    const perStar = scope.attributes?.[id];
    let values: (number | null | undefined)[] | undefined = perStar ? scope.stars.map((star) => perStar[star - 1]) : undefined;
    if (!allNumbers(values)) {
      // Some calculations only appear in the ability's footer, which names the attribute
      // in its own markup and carries the values as curve pairs.
      const entry = scope.footer?.find((footer) => footer.values && footer.desc?.includes(`"${id}"`));
      values = entry?.values ? scope.stars.map((star) => curveAt(entry.values!, star)) : undefined;
    }
    if (allNumbers(values)) return { kind: "value", text: renderValues(values, attributes) };
    // Rules-styled and unresolvable: a tracker the client fills in during a game.
    return attributes.style?.toLowerCase() === "rules" ? { kind: "counter" } : { kind: "miss" };
  }
  const pairs = scope.curves?.[attributes.row ?? ""] ?? scope.curves?.[attributes.fallbackrow ?? ""];
  const values = pairs ? scope.stars.map((star) => curveAt(pairs, star)) : undefined;
  return allNumbers(values) ? { kind: "value", text: renderValues(values, attributes) } : { kind: "miss" };
}

function cleanLine(line: string): string {
  return line
    .replace(/<[^>]*>/g, "")
    .replace(/\{[A-Za-z][\w.]*\}/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!%])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

/** Line by line, so a live counter costs only its own line. Null on any other miss. */
function markupToText(markup: string, scope: Scope): string | null {
  const lines: string[] = [];
  for (const line of markup.replace(/\r\n?/g, "\n").split("\n")) {
    let counter = false;
    let missed = false;
    const filled = line.replace(VALUE_TAG, (_, tag: string, raw: string) => {
      const resolved = resolveTag(tag, tagAttributes(raw), scope);
      if (resolved.kind === "value") return resolved.text;
      if (resolved.kind === "counter") counter = true;
      else missed = true;
      return "";
    });
    if (missed) return null;
    if (!counter) lines.push(cleanLine(filled));
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() || null;
}

/** The stat tags alone, as "150 Health · 10 AP"; the text between them is layout. */
function statLineText(statLine: string, scope: Scope): string | null {
  const parts: string[] = [];
  for (const [, tag, raw] of statLine.matchAll(VALUE_TAG)) {
    const resolved = resolveTag(tag!, { ...tagAttributes(raw!), type: "stat" }, scope);
    if (resolved.kind === "miss") return null;
    if (resolved.kind === "value") parts.push(resolved.text);
  }
  return parts.join(" · ") || null;
}
