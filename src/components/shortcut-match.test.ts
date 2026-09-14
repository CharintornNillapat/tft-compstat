import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./nav-tabs";
import { shortcutAction, type ShortcutContext } from "./shortcut-match";

const press = (key: string, over: Partial<ShortcutContext> = {}) =>
  shortcutAction({ key, hasModifier: false, inEditable: false, ...over });

describe("shortcutAction", () => {
  it("maps 1-8 to the eight nav routes, in order", () => {
    expect(NAV_ITEMS).toHaveLength(8);
    expect(["1", "2", "3", "4", "5", "6", "7", "8"].map((k) => press(k))).toEqual([
      { type: "navigate", index: 0 },
      { type: "navigate", index: 1 },
      { type: "navigate", index: 2 },
      { type: "navigate", index: 3 },
      { type: "navigate", index: 4 },
      { type: "navigate", index: 5 },
      { type: "navigate", index: 6 },
      { type: "navigate", index: 7 },
    ]);
  });

  it("keeps the keys pinned to the nav order, so a new tab rebinds them", () => {
    // Adding /bis, /augments and then /planner in front of /me moved Me from 5 to 6, 7
    // and 8; this is the assertion that catches the next such move rather than letting
    // it pass silently.
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/comps",
      "/tiers/champions",
      "/tiers/items",
      "/bis",
      "/augments",
      "/planner",
      "/me",
    ]);
    expect(press("7")).toEqual({ type: "navigate", index: 6 });
  });

  it("maps / to search", () => {
    expect(press("/")).toEqual({ type: "search" });
  });

  it("ignores digits with no route behind them", () => {
    expect(press("0")).toBeNull();
    expect(press("9")).toBeNull();
  });

  it("stays out of the way while the user is typing", () => {
    // The one that matters: typing "1" or "/" into the comps search box must
    // not navigate away mid-word.
    expect(press("1", { inEditable: true })).toBeNull();
    expect(press("/", { inEditable: true })).toBeNull();
  });

  it("never steals a browser chord", () => {
    expect(press("1", { hasModifier: true })).toBeNull();
    expect(press("/", { hasModifier: true })).toBeNull();
  });

  it("ignores anything else", () => {
    expect(press("a")).toBeNull();
    expect(press("Enter")).toBeNull();
    expect(press("")).toBeNull();
    // Number("") is 0, so an empty key must not resolve to route 1 via -1.
    expect(press(" ")).toBeNull();
  });
});
