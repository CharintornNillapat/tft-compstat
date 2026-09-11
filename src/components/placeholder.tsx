import type { ReactNode } from "react";

/** Marks a section that a later roadmap phase fills in. */
export function Placeholder({
  phase,
  title,
  children,
}: {
  phase: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-dashed border-line bg-panel/50 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded border border-line px-1.5 py-px font-mono text-[11px] text-faint uppercase">
          Phase {phase}
        </span>
        <h2 className="font-medium">{title}</h2>
      </div>
      <div className="mt-1.5 text-muted">{children}</div>
    </section>
  );
}
