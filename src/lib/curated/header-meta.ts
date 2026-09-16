import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getStaticNames } from "@/lib/static/lookup";
import { getMetaBrief } from "./meta-brief";

export type HeaderMetaData = {
  setName: string;
  patch: string;
};

/**
 * Returns ambient TFT Set & Patch metadata for the site header.
 * Cached as static game reference data.
 */
export async function getHeaderMeta(): Promise<HeaderMetaData> {
  "use cache";
  cacheTag("static");
  cacheLife("days");

  try {
    const [brief, staticNames] = await Promise.all([
      getMetaBrief().catch(() => null),
      getStaticNames().catch(() => null),
    ]);

    const setId = staticNames?.activeSet?.id ? `Set ${staticNames.activeSet.id}` : "Set 18";
    const patch = brief?.patch ? `Patch ${brief.patch}` : "Patch 18.2";

    return {
      setName: setId,
      patch,
    };
  } catch {
    return {
      setName: "Set 18",
      patch: "Patch 18.2",
    };
  }
}
