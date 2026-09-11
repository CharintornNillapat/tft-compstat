import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { revalidateEnv } from "@/lib/env";

/**
 * Drops cached reads after the seed scripts write (architecture §7–§8).
 *   POST { "tags": ["tiers"] } with `Authorization: Bearer $REVALIDATE_SECRET`
 */

const bodySchema = z.object({ tags: z.array(z.enum(CACHE_TAGS)).min(1) });

function isAuthorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${revalidateEnv().REVALIDATE_SECRET}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: `Expected {"tags": [...]} with tags from: ${CACHE_TAGS.join(", ")}` }, { status: 400 });
  }
  const tags = [...new Set(body.data.tags)];
  // expire: 0, so the next visit renders fresh data instead of the pre-seed copy once more.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
