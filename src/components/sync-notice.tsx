import { syncNotice } from "@/lib/sync/notice";
import type { SyncState } from "@/lib/sync/sync-service";

const TONES = {
  warn: "border-trait-gold/40 bg-trait-gold/10 text-trait-gold",
  error: "border-tier-s/40 bg-tier-s/10 text-tier-s",
} as const;

/** The "showing cached data" banner (architecture §9). Renders nothing when healthy. */
export function SyncNotice({ state, now }: { state: SyncState | null; now: number }) {
  const notice = syncNotice(state, now);
  if (!notice) return null;

  return (
    <div role="status" className={`rounded-md border px-3 py-2 ${TONES[notice.tone]}`}>
      <p className="font-medium">{notice.title}</p>
      {notice.detail && <p className="mt-0.5 text-muted">{notice.detail}</p>}
    </div>
  );
}
