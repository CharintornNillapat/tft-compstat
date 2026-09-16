"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NAV_ITEMS } from "./nav-tabs";
import { shortcutAction } from "./shortcut-match";

/**
 * Keyboard shortcuts for a second-monitor window (architecture §9): `1`–`6` switch
 * pages, `/` focuses the search box. Renders nothing.
 *
 * `useRouter` doesn't suspend, unlike the `usePathname` in `NavTabs`, so this needs
 * no Suspense boundary of its own.
 */
export function Shortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const action = shortcutAction({
        key: event.key,
        hasModifier: event.ctrlKey || event.metaKey || event.altKey,
        inEditable:
          !!target &&
          (target.isContentEditable ||
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT"),
      });
      if (!action) return;

      if (action.type === "search") {
        const search = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (!search) return;
        // Only swallow the "/" once there is something to focus, so on pages with
        // no search box the browser's own quick-find still works.
        event.preventDefault();
        search.focus();
        search.select();
        return;
      }

      if (action.type === "help") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-shortcuts-help"));
        return;
      }

      const href = NAV_ITEMS[action.index]?.href;
      if (href) {
        event.preventDefault();
        router.push(href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
