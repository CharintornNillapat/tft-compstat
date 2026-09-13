import { NAV_ITEMS } from "./nav-tabs";

/**
 * Which shortcut a keypress means, if any (architecture §9: `1`–`7` switch pages
 * and `/` focuses search).
 *
 * Pure and separate from the listener because this is where keyboard shortcuts
 * actually go wrong — firing while the user is typing, or stealing a browser
 * chord — and that is testable without a DOM.
 */

export type ShortcutContext = {
  key: string;
  /** Ctrl/Alt/Meta held. Shift is fine: `/` needs it on some layouts. */
  hasModifier: boolean;
  /** Focus is in an input, textarea or contenteditable. */
  inEditable: boolean;
};

export type ShortcutAction = { type: "navigate"; index: number } | { type: "search" };

export function shortcutAction(context: ShortcutContext): ShortcutAction | null {
  // Never hijack a keystroke meant for a text field or for the browser itself.
  if (context.inEditable || context.hasModifier) return null;

  if (context.key === "/") return { type: "search" };

  const index = Number(context.key) - 1;
  if (Number.isInteger(index) && index >= 0 && index < NAV_ITEMS.length) {
    return { type: "navigate", index };
  }
  return null;
}
