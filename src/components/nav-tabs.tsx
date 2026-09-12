"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The six routes, and the single source of truth for the number shortcuts — the
 * position in this list *is* the key, so reordering it rebinds them.
 *
 * `/bis` sits with the other two reference pages rather than at the end, which is
 * what moved `Me` from 5 to 6.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/comps", label: "Comps" },
  { href: "/tiers/champions", label: "Champions" },
  { href: "/tiers/items", label: "Items" },
  { href: "/bis", label: "BIS" },
  { href: "/me", label: "Me" },
] as const;

function activeHref(pathname: string) {
  return NAV_ITEMS.find(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  )?.href;
}

/** Static tab list; also the Suspense fallback while the pathname is unknown. */
export function NavList({ active }: { active?: string }) {
  return (
    <nav aria-label="Main" className="-mb-px h-full min-w-0 overflow-x-auto">
      <ul className="flex h-full items-stretch">
        {NAV_ITEMS.map(({ href, label }, index) => {
          const isActive = href === active;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                aria-keyshortcuts={String(index + 1)}
                className={`flex h-full items-center border-b-2 px-2.5 whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-accent text-fg"
                    : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {label}
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
