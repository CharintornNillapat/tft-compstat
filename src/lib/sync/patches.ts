/**
 * TFT patch labels by release date (architecture §6.4). Pure and client-safe.
 *
 * Set 18 moved TFT to Unreal and `game_version` became the literal
 * "TFT Unreal Version ?.?.?.?", so a match's patch can no longer be read off the
 * response. It's derived from when the game was played instead.
 *
 * Add a row per patch. A missing row mislabels matches but breaks nothing, and
 * `scripts/rederive.ts` recomputes labels from `matches.raw` with 0 API calls.
 */

export type PatchRelease = {
  set: number;
  /** The label the site and the curated YAML use, e.g. "18.2". */
  patch: string;
  /** UTC release date, `YYYY-MM-DD`. */
  released: string;
};

/** Sorted newest first within a set by `patchForMatch`; order here doesn't matter. */
export const PATCH_RELEASES: readonly PatchRelease[] = [
  { set: 17, patch: "17.1", released: "2026-04-15" },
  { set: 18, patch: "18.1", released: "2026-08-26" },
  { set: 18, patch: "18.2", released: "2026-09-10" },
];

/** `"<set>.?"` when no release matches — visibly unknown rather than silently wrong. */
export const unknownPatch = (set: number) => `${set}.?`;

/**
 * The patch in force for a set at a moment in time.
 * `playedAt` is epoch milliseconds, as `info.game_datetime` reports it.
 */
export function patchForMatch(
  set: number,
  playedAt: number,
  releases: readonly PatchRelease[] = PATCH_RELEASES,
): string {
  const candidates = releases
    .filter((release) => release.set === set && Date.parse(`${release.released}T00:00:00Z`) <= playedAt)
    .sort((a, b) => a.released.localeCompare(b.released));
  return candidates.at(-1)?.patch ?? unknownPatch(set);
}
