/**
 * Rank and LP formatting for the dashboard header and the `/` glance panel.
 * Pure: `rank_snapshots` rows in, display strings out.
 */

export type RankSnapshot = {
  tier: string | null;
  division: string | null;
  lp: number | null;
  wins: number | null;
  losses: number | null;
  capturedAt: string;
};

/** Apex tiers are a single ladder, so a division would be meaningless there. */
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** "Gold II", "Master", or "Unranked". Riot sends tiers uppercase. */
export function formatRank(rank: RankSnapshot | null): string {
  if (!rank?.tier) return "Unranked";
  const tier = titleCase(rank.tier);
  if (APEX_TIERS.has(rank.tier.toUpperCase()) || !rank.division) return tier;
  return `${tier} ${rank.division}`;
}

export function formatLp(rank: RankSnapshot | null): string | null {
  return rank?.lp == null ? null : `${rank.lp} LP`;
}

/**
 * LP change since the previous snapshot, but **only within the same division**.
 * Across a promotion the raw difference is nonsense (75 → 8 LP looks like −67 when
 * it was a promotion), so null is the honest answer and the UI just omits it.
 */
export function lpDelta(current: RankSnapshot | null, previous: RankSnapshot | null): number | null {
  if (!current || !previous) return null;
  if (current.lp == null || previous.lp == null) return null;
  if (current.tier !== previous.tier || current.division !== previous.division) return null;
  return current.lp - previous.lp;
}

export function rankRecord(
  rank: RankSnapshot | null,
): { wins: number; losses: number; winRate: number } | null {
  if (rank?.wins == null || rank.losses == null) return null;
  const played = rank.wins + rank.losses;
  return { wins: rank.wins, losses: rank.losses, winRate: played === 0 ? 0 : rank.wins / played };
}
