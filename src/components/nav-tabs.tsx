"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The eight routes, and the single source of truth for the number shortcuts — the
 * position in this list *is* the key, so reordering it rebinds them.
 *
 * `/bis`, `/augments` and `/planner` sit with the other game pages rather than at the
 * end, which is what moved `Me` from 5 to 6, to 7 and then to 8.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/comps", label: "Comps" },
  { href: "/tiers/champions", label: "Champions" },
  { href: "/tiers/items", label: "Items" },
  { href: "/bis", label: "BIS" },
  { href: "/augments", label: "Augments" },
  { href: "/planner", label: "Planner" },
  { href: "/me", label: "Me" },
] as const;

function activeHref(pathname: string) {
  return NAV_ITEMS.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  )?.href;
}

/**
 * Static tab list; also the Suspense fallback while the pathname is unknown.
 *
 * On a phone the eight tabs overflow, and a list clipped at a word boundary ("BIS")
 * gives no hint it scrolls. The right edge fades out instead, over the last 1.5rem.
 * The list ends in 1.5rem of padding, so scrolled to the end the fade covers only that
 * padding and "Me" is fully visible — and when nothing overflows, the fade is invisible.
 * `w-max` is what makes that padding count: a list only as wide as the nav overflows its
 * own box, and the scroll area then ends at the last tab, not after the padding.
 */
export function NavList({ active }: { active?: string }) {
  return (
    <nav
      aria-label="Main"
      className="-mb-px h-full min-w-0 overflow-x-auto mask-[linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)]"
    >
      <ul className="flex h-full w-max items-stretch pr-6">
        {NAV_ITEMS.map(({ href, label }, index) => {
          const isActive = href === active;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                aria-keyshortcuts={String(index + 1)}
                className={`group flex h-full items-center gap-1.5 border-b-2 px-2.5 whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-accent text-fg"
                    : "border-transparent text-muted hover:text-fg"
                }`}
              >
                <span>{label}</span>
                <kbd
                  aria-hidden="true"
                  className={`hidden rounded border px-1 py-px font-mono text-[9px] leading-none transition-colors sm:inline-block ${
                    isActive
                      ? "border-accent/40 bg-accent/15 text-accent"
                      : "border-line/70 bg-raised/70 text-faint group-hover:border-line group-hover:text-muted"
                  }`}
                >
                  {index + 1}
                </kbd>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function NavTabs() {
  return <NavList active={activeHref(usePathname())} />;
}
