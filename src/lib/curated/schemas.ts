import { z } from "zod";
import { BOARD_COLS, BOARD_ROWS, COMP_STYLES, MAX_UNIT_ITEMS, TIER_RANKS } from "@/lib/static/game";

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
