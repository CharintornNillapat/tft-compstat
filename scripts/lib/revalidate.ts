import type { CacheTag } from "@/lib/cache-tags";
import { revalidateEnv } from "@/lib/env";

/** Asks the site at SITE_URL to drop cached reads for `tags` (POST /api/revalidate). */
export async function revalidateSite(tags: CacheTag[]): Promise<void> {
  if (!process.env.SITE_URL) {
    console.warn(
      `SITE_URL is not set, so the site's "${tags.join(", ")}" cache was not revalidated; ` +
        "pages refresh on their own within a day. Set SITE_URL in .env.local to refresh them now.",
    );
    return;
  }
  const { SITE_URL, REVALIDATE_SECRET } = revalidateEnv();
  const url = new URL("/api/revalidate", SITE_URL);
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${REVALIDATE_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ tags }),
  });
  if (!response.ok) {
    throw new Error(`Data was written, but revalidation at ${url} failed: ${response.status} ${await response.text()}`);
  }
  console.log(`Revalidated "${tags.join(", ")}" on ${url.origin}.`);
}
