import type { ReactNode } from "react";

/**
 * The shell every `/` section shares (architecture §9): one heading style, so the
 * page's outline reads the same in every panel, plus an optional subtitle and a
 * right-aligned aside (a key, a link, a timestamp).
 */
export function OverviewPanel({
  title,
  subtitle,
  aside,
  className = "",
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-md border border-line bg-panel p-3 ${className}`}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>
        {subtitle ? <span className="min-w-0 truncate text-faint">{subtitle}</span> : null}
        {aside ? <span className="ml-auto flex shrink-0 items-center gap-2 text-faint">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}
