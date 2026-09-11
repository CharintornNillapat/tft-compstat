import { z } from "zod";

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

const apiName = z
  .string({ error: "must be an api_name string" })
  .regex(/^[A-Za-z0-9_]+$/, "must be an api_name like DA_18_Ashe");

const tierRow = z.array(apiName, { error: "must be a list of api_names, e.g. [DA_18_Ashe, DA_18_Sivir]" });

export const tierListFileSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:[-.][a-z0-9]+)*$/, 'must be lowercase words joined by "-" or ".", like "champions-18.1"'),
  kind: z.enum(TIER_LIST_KINDS),
  patch: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "is required"
          : 'must be a quoted string like "18.1" (unquoted, 18.10 would read as the number 18.1)',
    })
    .regex(/^\d+\.\d+[a-z]?$/, 'must look like "18.1"'),
  title: z.string().trim().min(1).optional(),
  /** Shown above the list, e.g. what changed this patch. */
  summary: z.string().trim().min(1).optional(),
  /** The list the site shows for this kind. At most one current list per kind. */
  current: z.boolean().default(false),
  tiers: z.strictObject(
    { S: tierRow.optional(), A: tierRow.optional(), B: tierRow.optional(), C: tierRow.optional() },
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
