import { z } from "zod";
import { BOARD_COLS, BOARD_ROWS, COMP_STYLES, MAX_UNIT_ITEMS, TIER_RANKS, type TierRank } from "@/lib/static/game";

/**
 * Curated YAML formats (architecture §7). Shape is checked here; references to
 * the static tables are checked in `validate.ts`.
 */

export const TIER_LIST_KINDS = ["champion", "item"] as const;
export type TierListKind = (typeof TIER_LIST_KINDS)[number];

/** Where each kind lives: `data/curated/<setId>/<file>`. */
export const TIER_LIST_FILES: Record<TierListKind, string> = {
  champion: "champion-tiers.yaml",
  item: "item-tiers.yaml",
};

/** Comps live one per file: `data/curated/<setId>/comps/<slug>.yaml`. */
export const COMPS_DIR = "comps";

/**
 * The patch brief shown on `/`: `data/curated/<setId>/meta-notes.yaml`.
 * Read straight from the repo at build time rather than seeded, so it never
 * reaches the DB and `seed:curated` only needs to know not to warn about it.
 */
export const META_NOTES_FILE = "meta-notes.yaml";

/**
 * The stage-2 opener boards shown on `/`: `data/curated/<setId>/openers.yaml`.
 * Read at build time like the patch brief above, so it is never seeded either —
 * but it *does* hold `api_name`s, which `openers.ts` checks against the static
 * lookup tables during prerender rather than against the DB during a seed.
 */
export const OPENERS_FILE = "openers.yaml";

const apiName = z
  .string({ error: "must be an api_name string" })
  .regex(/^[A-Za-z0-9_]+$/, "must be an api_name like DA_18_Ashe");

const apiNameList = z.array(apiName, { error: "must be a list of api_names, e.g. [DA_18_Ashe, DA_18_Sivir]" });

const patch = z
  .string({
    error: (issue) =>
      issue.input === undefined
        ? "is required"
        : 'must be a quoted string like "18.1" (unquoted, 18.10 would read as the number 18.1)',
  })
  .regex(/^\d+\.\d+[a-z]?$/, 'must look like "18.1"');

/** Item priority runs 1-3: past third, "priority" stops meaning anything. */
export const MAX_CARRY_PRIORITY = 3;

/**
 * A percentage, 0-100. Percent rather than a fraction because that is how a stats
 * site prints it and how an author will copy it; `validate.ts` divides by 100 so the
 * stored value matches the fractions `src/lib/stats` uses everywhere else.
 */
const percent = z
  .number({ error: "must be a percentage from 0 to 100, like 62.5 (not 0.625)" })
  .min(0, "must be at least 0")
  .max(100, "must be at most 100 — this is a percentage, so 62.5 rather than 0.625");

/** A whole number in `[min, max]`, with one message for every way to miss. */
const intIn = (min: number, max: number, message: string) =>
  z.int({ error: message }).min(min, message).max(max, message);

export const tierListFileSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, 'must be lowercase words joined by "-" or ".", like "champions-18.1"'),
  kind: z.enum(TIER_LIST_KINDS),
  patch,
  title: z.string().trim().min(1).optional(),
  /** Shown above the list, e.g. what changed this patch. */
  summary: z.string().trim().min(1).optional(),
  /** The list the site shows for this kind. At most one current list per kind. */
  current: z.boolean().default(false),
  tiers: z.strictObject(
    { S: apiNameList.optional(), A: apiNameList.optional(), B: apiNameList.optional(), C: apiNameList.optional() },
    {
      error: (issue) =>
        issue.code === "unrecognized_keys"
          ? `unknown tier ${issue.keys.map((key) => `"${key}"`).join(", ")}; use S, A, B or C`
          : undefined,
    },
  ),
  /** Hover notes keyed by api_name. */
  notes: z.record(apiName, z.string().trim().min(1, "must not be empty")).default({}),
});

export type TierListFile = z.infer<typeof tierListFileSchema>;

const boardUnitSchema = z.strictObject({
  unit: apiName,
  row: intIn(0, BOARD_ROWS - 1, `must be a row from 0 (front) to ${BOARD_ROWS - 1} (back)`),
  col: intIn(0, BOARD_COLS - 1, `must be a column from 0 to ${BOARD_COLS - 1}`),
  /** Star level to aim for. */
  star: intIn(1, 3, "must be 1, 2 or 3").default(2),
  carry: z.boolean().default(false),
  /** Item priority: 1 is built first. Checked against the unit's items in validate.ts. */
  priority: intIn(1, MAX_CARRY_PRIORITY, `must be 1, 2 or ${MAX_CARRY_PRIORITY}`).optional(),
  items: z.array(apiName).max(MAX_UNIT_ITEMS, `a unit holds at most ${MAX_UNIT_ITEMS} items`).default([]),
});

export const compFileSchema = z.strictObject({
  /** Also the URL (/comps/<slug>) and the file name (<slug>.yaml). */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase words joined by "-", like "ashe-fast-9"'),
  name: z.string().trim().min(1),
  tier: z.enum(TIER_RANKS),
  style: z.enum(COMP_STYLES),
  /** 1 easy, 2 medium, 3 hard. */
  difficulty: intIn(1, 3, "must be 1 (easy), 2 (medium) or 3 (hard)").optional(),
  patch,
  /** One-line pitch shown in the list. */
  summary: z.string().trim().min(1).optional(),
  /** Order within its tier on /comps; lower first, then by name. */
  order: intIn(-999, 999, "must be a whole number from -999 to 999").default(0),
  /** false hides the comp but keeps its row. */
  published: z.boolean().default(true),
  /** Sleeper pick: low pick rate, high top-4 rate. Shown as the "Gem" badge. */
  gem: z.boolean().default(false),
  /**
   * Author-supplied stats, all optional (architecture §0 rules out measuring these
   * ourselves). Rates are written here as a **percent** — 62.5, the way a stats site
   * shows it — and stored as a fraction; validate.ts converts.
   */
  avg_place: z
    .number({ error: "must be a number from 1 to 8, like 4.35" })
    .min(1, "must be at least 1")
    .max(8, "must be at most 8")
    .optional(),
  top4_rate: percent.optional(),
  pick_rate: percent.optional(),
  /** The level to aim for on the comp's power spike. */
  level_recommended: intIn(1, 10, "must be a level from 1 to 10").optional(),
  early_units: apiNameList.default([]),
  flex_units: apiNameList.default([]),
  board: z.array(boardUnitSchema, { error: "must be a list of units" }).min(1, "needs at least one unit"),
  /** Markdown: early/mid/late game, augments, positioning. */
  guide: z.string().trim().min(1).optional(),
});

export type CompFile = z.infer<typeof compFileSchema>;

/**
 * One glanceable line of a patch brief. Capped so it stays a single badge on a
 * second monitor: a sentence here would wrap the card instead of being scanned.
 */
const briefEntry = z
  .string({ error: "must be a short line of text" })
  .trim()
  .min(1, "must not be empty")
  .max(48, "must be at most 48 characters, so it fits on one badge");

const briefEntries = z
  .array(briefEntry, { error: "must be a list of short lines" })
  .max(6, "at most 6 fit in the card before it stops being a glance")
  .default([]);

export const metaNotesFileSchema = z
  .strictObject({
    patch,
    /** Heading of the card; defaults to "Patch <patch> brief". */
    title: z.string().trim().min(1).optional(),
    /** What got stronger — shown as green badges. */
    buffs: briefEntries,
    /** What got weaker — shown as red badges. */
    nerfs: briefEntries,
    /** One line of advice under the badges. */
    tip: z.string().trim().min(1).max(160, "must be at most 160 characters").optional(),
  })
  .refine((file) => file.buffs.length + file.nerfs.length > 0 || file.tip, {
    error: "needs at least one buff, nerf or tip; an empty brief would render an empty card",
  });

export type MetaNotesFile = z.infer<typeof metaNotesFileSchema>;

/**
 * Openers are rated on early-board strength and streak potential alone, so the
 * C band is left off: a stage-2 board you would not open on is not worth a row.
 */
export const OPENER_TIERS = ["S", "A", "B"] as const satisfies readonly TierRank[];
export type OpenerTier = (typeof OPENER_TIERS)[number];

/**
 * Every limit below is a layout constraint, not a taste one. The card is a glance
 * on a second monitor: a fifth unit or a fourth slam pushes the icon row into a
 * second line at 400px, and a ninth opener turns the section into a page.
 */
export const OPENER_UNITS = { min: 3, max: 4 } as const;
export const OPENER_ITEMS = { min: 2, max: 3 } as const;
export const OPENER_PIVOTS = { min: 2, max: 3 } as const;
export const MAX_OPENERS = 8;

/** The costs an opener may field. A 3-cost is not something you open on at 2-1. */
export const OPENER_COSTS: readonly number[] = [1, 2];

/** Same shape as a comp's `slug`, because that is what it has to match. */
const compSlug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a comp slug: lowercase words joined by "-", like "ashe-fast-9"');

const sized = <T extends z.ZodType>(item: T, { min, max }: { min: number; max: number }, what: string) =>
  z
    .array(item, { error: `must be a list of ${min}-${max} ${what}` })
    .min(min, `needs at least ${min} ${what}`)
    .max(max, `holds at most ${max} ${what} before the card stops being a glance`);

export const openerSchema = z.strictObject({
  /** Shown as the card heading, e.g. "Elderwood Brawlers". */
  name: z.string().trim().min(1),
  tier: z.enum(OPENER_TIERS),
  /** 1- and 2-cost units only; `openers.ts` checks the costs against the static tables. */
  core_units: sized(apiName, OPENER_UNITS, "champion api_names"),
  /** Universal early slams, in the order to build them. */
  slammable_items: sized(apiName, OPENER_ITEMS, "item api_names"),
  /** Comps this opener pivots into; each must be a published comp slug. */
  transition_to: sized(compSlug, OPENER_PIVOTS, "comp slugs"),
  /** One line of play advice. Capped so it stays two lines on the card at 400px. */
  notes: z.string().trim().min(1, "must not be empty").max(96, "must be at most 96 characters, so the card stays short"),
});

export const openersFileSchema = z.strictObject({
  patch,
  /** Heading of the section; defaults to "Early openers & item slams". */
  title: z.string().trim().min(1).optional(),
  openers: z
    .array(openerSchema, { error: "must be a list of openers" })
    .min(1, "needs at least one opener; an empty file would render an empty section")
    .max(MAX_OPENERS, `at most ${MAX_OPENERS} fit before the section stops being a glance`),
});

export type OpenersFile = z.infer<typeof openersFileSchema>;
