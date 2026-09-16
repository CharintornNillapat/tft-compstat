import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { PATCH_RELEASES } from "@/lib/sync/patches";

/**
 * The patch label has three independent sources that nothing used to compare
 * (audit 2026-09-16):
 *
 *   1. the MetaTFT feed, which writes `patch:` into every generated curated file
 *   2. `meta-notes.yaml`, hand-written, which drives the header pill and `/`
 *   3. `PATCH_RELEASES`, hand-written, which labels every synced match
 *
 * On patch day the feed moves on its own and the two hand-written ones do not, so
 * the site prints one patch, labels matches with another, and nothing goes red.
 * This test is what goes red.
 */

const CURATED = path.join(process.cwd(), "data", "curated");

/** The newest set folder — the live one, as `readNewestCuratedFile` picks it. */
function newestSetId(): number {
  const ids = readdirSync(CURATED, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .sort((a, b) => b - a);
  const newest = ids[0];
  if (newest === undefined) throw new Error(`No set folder in ${CURATED}`);
  return newest;
}

/** `patch:` from a curated file, or null when the file isn't there. */
function filePatch(setId: number, name: string): string | null {
  let text;
  try {
    text = readFileSync(path.join(CURATED, String(setId), name), "utf8");
  } catch {
    return null;
  }
  const patch: unknown = (parse(text) as { patch?: unknown })?.patch;
  if (typeof patch !== "string") throw new Error(`data/curated/${setId}/${name} names no patch`);
  return patch;
}

const setId = newestSetId();

const SOURCES = ["meta-notes.yaml", "champion-tiers.yaml", "item-tiers.yaml", "openers.yaml"] as const;

describe(`patch labels agree across set ${setId}`, () => {
  it("every curated file names the same patch", () => {
    const found = SOURCES.map((name) => [name, filePatch(setId, name)] as const).filter(
      (entry): entry is readonly [(typeof SOURCES)[number], string] => entry[1] !== null,
    );
    expect(found.length, "no curated file names a patch").toBeGreaterThan(0);

    // The message carries every file and its label, so a failure names the one that
    // disagrees rather than just reporting "18.2 !== 18.3".
    const distinct = [...new Set(found.map(([, patch]) => patch))];
    expect(distinct, `curated files disagree: ${JSON.stringify(Object.fromEntries(found))}`).toHaveLength(1);
  });

  it("PATCH_RELEASES knows that patch, so synced matches carry the same label", () => {
    const curated = filePatch(setId, "champion-tiers.yaml") ?? filePatch(setId, "meta-notes.yaml");
    expect(curated, "no patch to check against").not.toBeNull();

    const known = PATCH_RELEASES.filter((release) => release.set === setId).map((release) => release.patch);
    // A missing line here mislabels every match played on this patch (architecture §6.4).
    expect(known, `add { set: ${setId}, patch: "${curated}", released: "YYYY-MM-DD" } to src/lib/sync/patches.ts`)
      .toContain(curated);
  });

  it("the newest release in PATCH_RELEASES is the patch the site is showing", () => {
    const curated = filePatch(setId, "champion-tiers.yaml") ?? filePatch(setId, "meta-notes.yaml");
    const newest = PATCH_RELEASES.filter((release) => release.set === setId)
      .toSorted((a, b) => a.released.localeCompare(b.released))
      .at(-1);
    expect(newest?.patch).toBe(curated);
  });
});
