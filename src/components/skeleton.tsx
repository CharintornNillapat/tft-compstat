/** Loading placeholders for the Suspense boundaries on `/` and `/me` (architecture §9). */

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

export function SkeletonPanel({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <section aria-hidden className={`rounded-md border border-line bg-panel p-3 ${className}`}>
      <SkeletonLine className="h-4 w-40" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonLine key={i} className="h-3 w-full bg-zinc-800/70" />
        ))}
      </div>
    </section>
  );
}
