import { describe, expect, it } from "vitest";
import { parseAugmentTiers } from "./augment-tiers";
import { formatIssue } from "./validate";

const FILE = "data/curated/18/augment-tiers.yaml";
const ICON = "https://raw.communitydragon.org/16.18/game/assets/maps/tft/icons/augments/hexcore/grab-bag-ii.png";

const augment = (apiName: string, extra = "") =>
  `  - api_name: ${apiName}\n    name: ${apiName.replace("DA_", "")}\n    rarity: Gold\n    tier: S\n    icon_url: ${ICON}\n${extra}`;

const fileWith = (augments: string, comps = "") => `patch: "18.2"\naugments:\n${augments}${comps ? `comps:\n${comps}` : ""}`;

const issuesOf = (text: string) => parseAugmentTiers(FILE, text).issues.map(formatIssue);

describe("parseAugmentTiers", () => {
  it("parses a valid file, defaulting the title and an absent comps map", () => {
    const { tiers, issues } = parseAugmentTiers(FILE, fileWith(augment("DA_One", "    description: Gain 2 gold.\n")));
    expect(issues).toEqual([]);
    expect(tiers).toEqual({
      patch: "18.2",
      title: "Augment tier list",
      source: null,
      augments: [
        { apiName: "DA_One", name: "One", rarity: "Gold", tier: "S", iconUrl: ICON, description: "Gain 2 gold." },
      ],
      comps: {},
    });
  });

  it("rejects an unknown rarity and a non-CommunityDragon icon, with line numbers", () => {
    const text = fileWith(
      "  - api_name: DA_One\n    name: One\n    rarity: Bronze\n    tier: S\n    icon_url: https://cdn.metatft.com/file/one.png\n",
    );
    expect(issuesOf(text)).toEqual([
      `${FILE}:5:13  augments[0].rarity: must be one of "Silver", "Gold", "Prismatic"`,
      `${FILE}:7:15  augments[0].icon_url: must be a CommunityDragon asset URL like https://raw.communitydragon.org/16.18/game/assets/…`,
    ]);
  });

  it("rejects a duplicate augment and comp picks that name unlisted or repeated augments", () => {
    const text = fileWith(
      augment("DA_One") + augment("DA_Two") + augment("DA_One"),
      "  draven-fast-9:\n    augments: [DA_One, DA_Two, DA_Ghost, DA_One]\n",
    );
    expect(issuesOf(text)).toEqual([
      expect.stringContaining("augments[2].api_name: DA_One is listed more than once"),
      expect.stringContaining("DA_Ghost is not in augments, so it has no name or icon to show"),
      expect.stringContaining("DA_One is picked twice for draven-fast-9"),
    ]);
  });

  it("enforces the 4-6 picks a comp panel is built for", () => {
    const four = ["DA_A", "DA_B", "DA_C", "DA_D"];
    const augments = four.map((name) => augment(name)).join("");
    expect(issuesOf(fileWith(augments, `  draven-fast-9:\n    augments: [${four.join(", ")}]\n`))).toEqual([]);
    expect(issuesOf(fileWith(augments, "  draven-fast-9:\n    augments: [DA_A, DA_B]\n"))).toEqual([
      expect.stringContaining("needs at least 4 augments"),
    ]);
  });

  it("reports broken YAML instead of throwing", () => {
    expect(issuesOf("patch: [unclosed")).toEqual([expect.stringContaining("invalid YAML")]);
  });
});
