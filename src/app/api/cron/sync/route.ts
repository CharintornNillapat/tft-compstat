import { timingSafeEqual } from "node:crypto";
import { secretsEnv } from "@/lib/env";
import { getTrackedPuuid, syncPlayer } from "@/lib/sync/sync-service";

/**
 * Daily Riot sync (architecture §5.3). Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`; see the schedule in `vercel.json`.
 *
 * It also keeps the Supabase free tier from auto-pausing.
 */

// A sync is ~2–22 calls; the limiter can space them out, so allow room.
export const maxDuration = 60;

function isAuthorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${secretsEnv().CRON_SECRET}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const puuid = await getTrackedPuuid();
  if (!puuid) {
    return Response.json({ error: "No tracked account; run `pnpm riot:setup`." }, { status: 503 });
  }

  const result = await syncPlayer(puuid, "cron");
  // Always 200: a rate limit or an expired key is a reported outcome, not a failed
  // cron. A non-2xx would just make Vercel retry into the same wall.
  return Response.json(result);
}
