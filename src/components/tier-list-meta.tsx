import type { TierListMeta } from "@/lib/curated/queries";

const updated = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** "Patch 18.2 · Enchanted Wilds · Updated Sep 11, 2026" */
export function TierListMetaLine({ list }: { list: TierListMeta }) {
  return (
    <>
      Patch {list.patch}
      {list.setName ? ` · ${list.setName}` : ""} · Updated{" "}
      <time dateTime={list.updatedAt}>{updated.format(new Date(list.updatedAt))}</time>
    </>
  );
}
