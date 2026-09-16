import Link from "next/link";
import { Suspense } from "react";
import { HeaderMetaPill } from "./header-meta-pill";
import { NavList, NavTabs } from "./nav-tabs";
import { ShortcutsHelp } from "./shortcuts-help";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-11 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href="/"
            aria-label="CompStat home"
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-4 text-accent">
              <path
                d="M12 2 20.66 7v10L12 22l-8.66-5V7z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinejoin="round"
              />
            </svg>
            {/* Wordmark hidden on phones so all tabs fit. */}
            <span className="hidden sm:inline">CompStat</span>
          </Link>
          <Suspense fallback={null}>
            <HeaderMetaPill />
          </Suspense>
        </div>

        {/* usePathname suspends on dynamic routes under Cache Components. */}
        <div className="min-w-0 flex-1">
          <Suspense fallback={<NavList />}>
            <NavTabs />
          </Suspense>
        </div>

        <div className="shrink-0">
          <ShortcutsHelp />
        </div>
      </div>
    </header>
  );
}
