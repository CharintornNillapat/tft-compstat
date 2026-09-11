import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="rounded-md border border-dashed border-line bg-panel/50 px-3 py-6 text-center">
      <h2 className="font-medium">{title}</h2>
      {children ? <div className="mt-1 text-muted">{children}</div> : null}
    </section>
  );
}
