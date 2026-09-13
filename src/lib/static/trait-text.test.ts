import { describe, expect, it } from "vitest";
import { traitEffects } from "./cdragon";
import { augmentText, binHash, traitText, UNKNOWN_VALUE } from "./trait-text";

// Hunter as CommunityDragon ships it for Set 18 (game data 16.18), trimmed to two rows:
// a named key (DamageAmp) next to hashed ones (HunterAD, HunterDuration).
const HUNTER_DESC =
  "Hunters gain Attack Damage. If a Hunter hasn't swapped targets for @HunterDuration@ seconds, " +
  "they gain @DamageAmp*100@% Damage Amp.<br><row>(@MinUnits@) @HunterAD*100@% %i:scaleAD%</row>" +
  "<br><row>(@MinUnits@) @HunterAD*100@% %i:scaleAD%</row>";
const hunterEffects = [
  { minUnits: 2, style: 1, variables: { DamageAmp: 0.10000000149011612, "{641254b6}": 0.20000000298023224, "{83011ee7}": 3 } },
  { minUnits: 3, style: 3, variables: { DamageAmp: 0.10000000149011612, "{641254b6}": 0.30000001192092896, "{83011ee7}": 3 } },
];

describe("binHash", () => {
  it("reproduces the hashed variable names in the game data", () => {
    expect(binHash("HunterAD")).toBe("{641254b6}");
    expect(binHash("HunterDuration")).toBe("{83011ee7}");
    expect(binHash("BonusDamagePercentBase")).toBe("{a9a813e7}");
  });

  it("ignores case, as the client does", () => {
    expect(binHash("ASPerAttack")).toBe(binHash("ASperAttack"));
  });
});

describe("traitText", () => {
  it("resolves named and hashed variables, scaled and unscaled, and splits the rows", () => {
    expect(traitText(HUNTER_DESC, hunterEffects)).toEqual({
      description: "Hunters gain Attack Damage. If a Hunter hasn't swapped targets for 3 seconds, they gain 10% Damage Amp.",
      rows: ["20% AD", "30% AD"],
    });
  });

  it("matches a placeholder to a key that differs only in case (Rapidfire)", () => {
    const { rows } = traitText("<row>(@MinUnits@) +@ASPerAttack*100@% %i:scaleAS% per Attack</row>", [
      { minUnits: 2, variables: { ASperAttack: 0.029999971389770508 } },
    ]);
    expect(rows).toEqual(["+3% Attack Speed per Attack"]);
  });

  it("prints a visible marker for a variable no effect carries", () => {
    expect(traitText("Gain @Mystery@ gold.", [{ minUnits: 1, variables: {} }]).description).toBe(
      `Gain ${UNKNOWN_VALUE} gold.`,
    );
  });

  it("falls back to another effect's variables when the row's own effect lacks one", () => {
    const { rows } = traitText("<row>(@MinUnits@) @Bonus@ for @Duration@s</row><row>(@MinUnits@) @Bonus@</row>", [
      { minUnits: 2, variables: { Bonus: 5, Duration: 4 } },
      { minUnits: 4, variables: { Bonus: 9 } },
    ]);
    expect(rows).toEqual(["5 for 4s", "9"]);
  });

  it("strips markup, names stat icons and tidies the spacing", () => {
    const desc =
      "<TFTKeyword>Burn</TFTKeyword> for @X@&nbsp;seconds.<br><br><br>" +
      "Gain @Armor@ %i:scaleArmor%%i:scaleMR%, then <rules>(once)</rules>";
    expect(traitText(desc, [{ minUnits: 1, variables: { X: 3, Armor: 20 } }]).description).toBe(
      "Burn for 3 seconds.\n\nGain 20 Armor MR, then (once)",
    );
  });

  it("returns nothing for a missing description, and no description when it is all rows", () => {
    expect(traitText(undefined, hunterEffects)).toEqual({ description: null, rows: [null, null] });
    expect(traitText("", [])).toEqual({ description: null, rows: [] });
    // An effect without a unit count has no row; the row goes to the next counted one.
    expect(traitText("<row>(@MinUnits@) Three</row>", [{ minUnits: null }, { minUnits: 3 }])).toEqual({
      description: null,
      rows: [null, "Three"],
    });
  });
});

describe("traitEffects", () => {
  it("keeps the text of exactly the breakpoints traitBreakpoints keeps (Rival repeats a count)", () => {
    const effects = [
      { minUnits: 1, style: 5 },
      { minUnits: 1, style: 1 },
      { minUnits: 2, style: 5 },
      { minUnits: 4, style: 3 },
    ];
    // Min 1 keeps its lowest style (bronze), so it takes the bronze effect's row.
    expect(traitEffects(effects, ["gold one", "bronze one", "two", null])).toEqual([
      { min: 1, text: "bronze one" },
      { min: 2, text: "two" },
    ]);
  });
});

describe("augmentText", () => {
  it("resolves an augment's flat variables, named and hashed, scaled and unscaled", () => {
    // U.R.F as CommunityDragon ships it (game data 16.18).
    expect(
      augmentText(
        "Gain a Spatula. Champions holding Spatula or Frying Pan items gain @AttackSpeed*100@% Attack Speed and @ManaRegen@ Mana Regen.",
        { AttackSpeed: 0.20000000298023224, [binHash("ManaRegen")]: 3 },
      ),
    ).toBe("Gain a Spatula. Champions holding Spatula or Frying Pan items gain 20% Attack Speed and 3 Mana Regen.");
  });

  it("turns line breaks into newlines and strips keyword tags", () => {
    expect(augmentText("Gain <TFTBonus>@Gold@</TFTBonus> gold.<br><br>Now.", { Gold: 12 })).toBe("Gain 12 gold.\n\nNow.");
  });

  it("returns null rather than printing a marker when any placeholder is unresolved", () => {
    expect(augmentText("Reward: @TFTUnitProperty.item:TFT11_Augment_CallToChaos@", { Gold: 52 })).toBeNull();
    expect(augmentText("Gain @Gold@ gold and @Missing@ XP.", { Gold: 4 })).toBeNull();
  });

  it("returns null for no text at all", () => {
    expect(augmentText(null, {})).toBeNull();
    expect(augmentText("<br>", {})).toBeNull();
  });
});

describe("traitText, icons the export dropped", () => {
  it("drops an OR stranded where two stat icons used to be, and keeps one between words", () => {
    // Adaptor as CommunityDragon ships it for Set 18: the AP and AD icons are gone.
    const { rows } = traitText("<row>(@MinUnits@) @ADAPGain*100@%  OR</row><br><row>(@MinUnits@) @X@% %i:scaleAD% OR %i:scaleAP%</row>", [
      { minUnits: 2, variables: { ADAPGain: 0.25 } },
      { minUnits: 3, variables: { X: 10 } },
    ]);
    expect(rows).toEqual(["25%", "10% AD OR AP"]);
  });
});
