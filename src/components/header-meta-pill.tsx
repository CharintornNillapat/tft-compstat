import { getHeaderMeta } from "@/lib/curated/header-meta";
import { MetaFreshnessDot } from "./meta-freshness-dot";

/**
 * Ambient Set & Patch badge for the site header, with a sync dot that reports how old
 * the curated data actually is (architecture §8). Every field is real data: with no
 * active set and no patch there is nothing honest to print, so the pill doesn't render.
 */
export async function HeaderMetaPill() {
  const { setName, patch, dataUpdatedAt } = await getHeaderMeta();
  if (!setName && !patch) return null;

  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-line/80 bg-raised/50 px-2 py-0.5 text-[11px] text-muted transition-colors sm:inline-flex">
      <MetaFreshnessDot updatedAt={dataUpdatedAt} />
      {setName && <span className="font-medium text-fg">{setName}</span>}
      {setName && patch && <span className="text-faint">·</span>}
      {patch && <span className="tabular-nums text-muted">Patch {patch}</span>}
    </span>
  );
}
