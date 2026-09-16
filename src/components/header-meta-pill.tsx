import { getHeaderMeta } from "@/lib/curated/header-meta";

/**
 * Ambient Set & Patch badge for the site header.
 * Displays current set and patch with a live green pulsating sync dot.
 */
export async function HeaderMetaPill() {
  const meta = await getHeaderMeta();

  return (
    <span
      title={`Live TFT Meta Context: ${meta.setName} · ${meta.patch}`}
      className="hidden items-center gap-1.5 rounded-full border border-line/80 bg-raised/50 px-2 py-0.5 text-[11px] text-muted transition-colors sm:inline-flex"
    >
      <span className="relative flex size-1.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-buff opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-buff" />
      </span>
      <span className="font-medium text-fg">{meta.setName}</span>
      <span className="text-faint">·</span>
      <span className="tabular-nums text-muted">{meta.patch}</span>
    </span>
  );
}
