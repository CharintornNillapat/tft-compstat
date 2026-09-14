import { describe, expect, it } from "vitest";
import {
  abilityText,
  itemText,
  lookupUnitSchema,
  matchLookupUnit,
  parseLookupEntries,
  type LookupItem,
  type LookupUnit,
} from "./metatft-text";

// Shapes and markup copied from MetaTFT's Set 18 lookup, trimmed to what each test needs.
const ashe: LookupUnit = {
  apiName: "TFT18_Ashe",
  name: "Ashe",
  cost: 4,
  shopUnit: true,
  curveValues: {
    DamageFalloffPerEnemy: [[1, 0.8], [3, 0.4], [4, 0.4]],
    MinDamagePercent: [[1, 0.2], [4, 0.2]],
    ChillPercent: [[1, 20], [4, 20]],
  },
  ability: {
    name: "Spirit Rift",
    desc:
      'Deals <TFTAttribute attributeID="TFTCalculationAttributes.PhysicalDamageCalc1" style="colorPhysical" icon="icon.AD"/> physical damage, ' +
      'reduced by <TFTCurveTable row="DamageFalloffPerEnemy" format="percent"/> per enemy hit ' +
      '(minimum <TFTCurveTable row="MinDamagePercent" format="percent"/>) and <TFTCurveTable row="ChillPercent"/>% <Keyword>Slows</> them.' +
      "\r\n\r\n<Rules>Slow: Reduce Attack Speed</>",
    attributeValues: { "TFTCalculationAttributes.PhysicalDamageCalc1": [465, 700, 1000, 1000] },
  },
};

const item = (desc: string, curveValues: LookupItem["curveValues"] = {}, statLine?: string): LookupItem => ({
  apiName: "DA_Test",
  desc,
  statLine,
  curveValues,
});

describe("abilityText", () => {
  it("fills attributes per star, steps curve values and drops style tags", () => {
    expect(abilityText(ashe)).toEqual({
      name: "Spirit Rift",
      text:
        "Deals 465 / 700 / 1000 (AD) physical damage, reduced by 80% / 80% / 40% per enemy hit (minimum 20%) and 20% Slows them." +
        "\n\nSlow: Reduce Attack Speed",
    });
  });

  it("falls back to a footer entry that names the attribute", () => {
    const ivern: LookupUnit = {
      apiName: "TFT18_Ivern",
      name: "Ivern",
      cost: 3,
      ability: {
        name: "Friend of the Forest",
        desc: 'Shield an ally for <TFTAttribute attributeID="TFTCalculationAttributes.ShieldCalc1" icon="icon.AP, icon.DamageAmp"/>.',
        attributeValues: {},
        footer: [
          { desc: 'Shield: <TFTAttribute attributeID="TFTCalculationAttributes.ShieldCalc1"/>', values: [[1, 250], [2, 375], [3, 600]] },
        ],
      },
    };
    expect(abilityText(ivern)?.text).toBe("Shield an ally for 250 / 375 / 600 (AP, Damage Amp).");
  });

  it("drops the line holding a live counter but keeps the rest", () => {
    const veigar: LookupUnit = {
      ...ashe,
      ability: {
        name: "Dark Matter",
        desc: 'Deal <TFTCurveTable row="ChillPercent"/> magic damage.\r\n\r\nBonus AP: <TFTAttribute attributeID="TFTSpellAttributes.Stack" precision="0"/>',
      },
    };
    expect(abilityText(veigar)?.text).toBe("Deal 20 magic damage.");
  });

  it("turns an icon-only attribute into its stat word", () => {
    const gromp: LookupUnit = {
      ...ashe,
      ability: {
        name: "Belchy Bubble",
        desc:
          '<Bright>Adaptor </><TFTAttribute style="colorMagic" icon=" icon.AP"/><Bright>:</> Deal <TFTCurveTable row="ChillPercent"/> damage.\r\n' +
          '<dim>Adaptor </><TFTAttribute icon="icon.AD"/><dim>: Heavily slows the target.</>',
      },
    };
    expect(abilityText(gromp)?.text).toBe("Adaptor AP: Deal 20 damage.\nAdaptor AD: Heavily slows the target.");
  });

  it("treats an unresolved rules-styled attribute as a live tracker and drops its line", () => {
    const teemo: LookupUnit = {
      ...ashe,
      ability: {
        name: "Forage",
        desc:
          'Forage a mushroom for <TFTCurveTable row="ChillPercent"/> gold.\r\n' +
          '<Rules>(Greens Foraged:</> <TFTAttribute style="rules" attributeID="TFTCalculationAttributes.GenericCalc1"/><Rules>)</>',
      },
    };
    expect(abilityText(teemo)?.text).toBe("Forage a mushroom for 20 gold.");
  });

  it("drops string-table references that only the client expands", () => {
    const rival: LookupUnit = {
      ...ashe,
      ability: {
        name: "Leap",
        desc: 'Deal <TFTCurveTable row="ChillPercent"/> damage.{Augment.Variant.RivalsAugment.AbilityTooltip}',
      },
    };
    expect(abilityText(rival)?.text).toBe("Deal 20 damage.");
  });

  it("returns null when any other value does not resolve, or without a name or text", () => {
    const broken: LookupUnit = {
      ...ashe,
      ability: { name: "Spirit Rift", desc: 'Deals <TFTAttribute attributeID="TFTCalculationAttributes.GenericCalc1"/> damage.' },
    };
    expect(abilityText(broken)).toBeNull();
    expect(abilityText({ ...ashe, ability: { ...ashe.ability, name: " " } })).toBeNull();
    expect(abilityText({ ...ashe, ability: null })).toBeNull();
  });
});

describe("itemText", () => {
  it("applies percent formats and precision, and reads the stat line as stat words", () => {
    const text = itemText(
      item(
        'Gain <TFTCurveTable row="HealthMult" format="percentMinusOne"/> max Health and take <TFTCurveTable row="Taken" format="invertedPercent"/> less damage for <TFTCurveTable row="Duration" precision="0"/> seconds.',
        { HealthMult: [[1, 1.08]], Taken: [[1, 0.75]], Duration: [[1, 12.4]], Health: [[1, 150]], AP: [[1, 10]] },
        '<TFTCurveTable row="Health" icon="icon.Health" type="stat"/> <Bright>|</Bright> <TFTCurveTable row="AP" icon="Icon.AP" type="stat"/>',
      ),
    );
    expect(text).toEqual({
      description: "Gain 8% max Health and take 25% less damage for 12 seconds.",
      stats: "150 Health · 10 AP",
    });
  });

  it("drops runtime counters and image tags, and keeps rules text on its own line", () => {
    const text = itemText(
      item(
        'Grants <TFTCurveTable row="Armor"/> Armor. At full stacks, grant <img id="icon.Coin"/> 1 gold.\r\n\r\n' +
          'Gold generated this game: <TFTAttribute attributeId="TFTItemAttributes.Stack2"/>\r\n\r\n<rules>Unique - only 1 per champion</>',
        { Armor: [[1, 20]] },
      ),
    );
    expect(text.description).toBe("Grants 20 Armor. At full stacks, grant 1 gold.\n\nUnique - only 1 per champion");
  });

  it("returns null for a description or stat line with a value it cannot resolve", () => {
    const text = itemText(item('Attacks deal <TFTAttribute attributeID="TFTCalculationAttributes.GenericCalc1"/> bonus magic damage.', {}, '<TFTCurveTable row="Missing" type="stat"/>'));
    expect(text).toEqual({ description: null, stats: null });
    expect(itemText({ apiName: "DA_Empty" })).toEqual({ description: null, stats: null });
  });
});

describe("matchLookupUnit", () => {
  const units: LookupUnit[] = [
    ashe,
    { apiName: "TFT18_Elise", name: "Elise", cost: 2, shopUnit: true },
    { apiName: "TFT18_EliseSpider", name: "Elise", cost: 2, shopUnit: false },
    { apiName: "TFT18_TwinA", name: "Twin", cost: 1, shopUnit: true },
    { apiName: "TFT18_TwinB", name: "Twin", cost: 1, shopUnit: true },
  ];

  it("joins on name and cost, preferring the shop unit when a name repeats", () => {
    expect(matchLookupUnit(units, { name: "Ashe", cost: 4 })?.apiName).toBe("TFT18_Ashe");
    expect(matchLookupUnit(units, { name: "Elise", cost: 2 })?.apiName).toBe("TFT18_Elise");
  });

  it("matches nothing when still ambiguous or when the cost differs", () => {
    expect(matchLookupUnit(units, { name: "Twin", cost: 1 })).toBeUndefined();
    expect(matchLookupUnit(units, { name: "Ashe", cost: 5 })).toBeUndefined();
  });
});

describe("parseLookupEntries", () => {
  it("keeps entries that match and counts the ones it skips", () => {
    const { parsed, skipped } = parseLookupEntries(lookupUnitSchema, [ashe, { apiName: 7 }, null]);
    expect(parsed.map((unit) => unit.apiName)).toEqual(["TFT18_Ashe"]);
    expect(skipped).toBe(2);
  });
});
