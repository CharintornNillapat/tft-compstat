/**
 * CommunityDragon trait text → plain text (architecture §4.8). Pure.
 *
 * A trait's `desc` is client markup: one `<row>` per breakpoint, `<br>`, keyword
 * tags, `%i:scaleAS%` stat icons, and `@Variable@` / `@Variable*100@` placeholders
 * whose values sit in each effect's `variables`. Most of those keys ship **hashed**
 * (`{a9a813e7}`), because the client keeps only a hash of the bin name — FNV-1a over
 * the lowercased name, which `binHash` reproduces. That resolves every placeholder in
 * Set 18 (239 of 239), including `ASPerAttack`, whose key is spelled `ASperAttack`.
 */

/** Stat icons the client draws inline, as the word the icon stands for. */
const STAT_ICONS: Record<string, string> = {
  scaleAD: "AD",
  scaleAP: "AP",
  scaleAS: "Attack Speed",
  scaleArmor: "Armor",
  scaleMR: "MR",
  scaleHealth: "Health",
  scaleManaRegen: "Mana Regen",
  scaleDR: "Durability",
};

/** Printed where a placeholder names a variable no effect carries: visible, never blank. */
export const UNKNOWN_VALUE = "?";

const HASHED_KEY = /^\{[0-9a-f]{8}\}$/;
const PLACEHOLDER = /@([A-Za-z0-9_.:]+)(?:\*(-?[\d.]+))?@/g;

/** A CommunityDragon bin-name hash: FNV-1a 32 over the lowercased name, as `{xxxxxxxx}`. */
export function binHash(name: string): string {
  let hash = 0x811c9dc5;
  for (const char of name.toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `{${hash.toString(16).padStart(8, "0")}}`;
}

type Effect = { minUnits: number | null; variables?: Record<string, unknown> | null };

/** One effect's numeric variables keyed by hash, so a name and its hashed twin look up alike. */
function hashedVariables(effect: Effect): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, value] of Object.entries(effect.variables ?? {})) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out.set(HASHED_KEY.test(key) ? key : binHash(key), value);
  }
  return out;
}

/** 0.10000000149011612 × 100 → "10": float noise off, at most two decimals. */
const formatValue = (value: number) => String(Number(value.toFixed(2)));

/** Fills placeholders from the first scope that has the variable; `onMiss` hears about each one it can't. */
function substitute(
  markup: string,
  effect: Effect | undefined,
  scopes: readonly ReadonlyMap<string, number>[],
  onMiss?: () => void,
): string {
  return markup.replace(PLACEHOLDER, (_, name: string, scale: string | undefined) => {
    const value =
      name === "MinUnits"
        ? (effect?.minUnits ?? undefined)
        : scopes.map((scope) => scope.get(binHash(name))).find((found) => found !== undefined);
    const scaled = value === undefined ? NaN : value * (scale === undefined ? 1 : Number(scale));
    if (Number.isFinite(scaled)) return formatValue(scaled);
    onMiss?.();
    return UNKNOWN_VALUE;
  });
}

/**
 * An augment's `desc` → plain text, or null when any placeholder is unresolved.
 *
 * An augment keeps its variables in one flat `effects` object rather than per
 * breakpoint. And unlike a trait row, where a visible "?" beats a blank bonus, a
 * tooltip reading "Gain ? Gold" is worse than no description — so a miss drops the
 * text. On patch 18.2 every augment on MetaTFT's list resolves (248 of 248).
 */
export function augmentText(
  desc: string | null | undefined,
  variables: Record<string, unknown> | null | undefined,
): string | null {
  if (!desc) return null;
  const effect: Effect = { minUnits: null, variables };
  let missed = false;
  const text = toPlainText(
    substitute(desc, effect, [hashedVariables(effect)], () => {
      missed = true;
    }),
  );
  return missed || !text ? null : text;
}

function toPlainText(markup: string): string {
  return markup
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/%i:(\w+)%/g, (_, icon: string) => ` ${STAT_ICONS[icon] ?? ""} `)
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        // Not "?" or "!": the unknown-value marker is a "?" that must keep its space.
        .replace(/\s+([,.;:])/g, "$1")
        // An uppercase OR/AND stranded at either end of a line joined two stat icons the
        // export dropped: Set 18's Adaptor ships "@ADAPGain*100@%  OR", which read "25% OR".
        .replace(/^(?:OR|AND)\s+|\s+(?:OR|AND)$/g, "")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type TraitText = {
  /** Everything outside the rows; null when nothing is left. */
  description: string | null;
  /** `rows[i]` is the text of `effects[i]`; null where that effect has no row. */
  rows: (string | null)[];
};

/**
 * The n-th `<row>` belongs to the n-th effect with a unit count, which holds for every
 * Set 18 trait. A row's own effect is searched first for its variables and then the
 * others, because the shared ones (a duration, a cap) are only sometimes repeated.
 */
export function traitText(desc: string | null | undefined, effects: readonly Effect[]): TraitText {
  const rows: (string | null)[] = effects.map(() => null);
  if (!desc) return { description: null, rows };

  const scopes = effects.map(hashedVariables);
  const counted = effects.flatMap((effect, index) => (effect.minUnits === null ? [] : [index]));

  let next = 0;
  const intro = desc.replace(/<row>([\s\S]*?)<\/row>/gi, (_, row: string) => {
    const index = counted[next++];
    if (index !== undefined) {
      // The "(3)" prefix goes: the tooltip draws the unit count as its own plate.
      const body = row.replace(/^\s*\(@MinUnits@\)\s*/, "");
      rows[index] = toPlainText(substitute(body, effects[index], [scopes[index]!, ...scopes])) || null;
    }
    return "";
  });

  const description = toPlainText(substitute(intro, effects[0], scopes));
  return { description: description || null, rows };
}
