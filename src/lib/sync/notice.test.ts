import { describe, expect, it } from "vitest";
import { syncNotice } from "./notice";
import type { SyncState } from "./sync-service";

const NOW = Date.parse("2026-09-12T05:00:00.000Z");
const state = (over: Partial<SyncState>) =>
  ({ status: "ok", last_error: null, next_allowed_at: null, ...over }) as SyncState;

describe("syncNotice", () => {
  it("says nothing when the sync is healthy or has never run", () => {
    expect(syncNotice(state({ status: "ok" }), NOW)).toBeNull();
    expect(syncNotice(state({ status: "idle" }), NOW)).toBeNull();
    expect(syncNotice(state({ status: "running" }), NOW)).toBeNull();
    expect(syncNotice(null, NOW)).toBeNull();
  });

  it("counts down the rate limit rather than just naming it", () => {
    const notice = syncNotice(
      state({ status: "rate_limited", next_allowed_at: "2026-09-12T05:00:42.000Z" }),
      NOW,
    );
    expect(notice).toMatchObject({ tone: "warn", detail: "Retrying in 42s." });
    expect(notice?.title).toMatch(/cached data/);
  });

  it("never shows a negative countdown once the window has passed", () => {
    const notice = syncNotice(state({ status: "rate_limited", next_allowed_at: "2026-09-12T04:59:00.000Z" }), NOW);
    expect(notice?.detail).toBe("Retrying in 0s.");
  });

  it("copes with a rate limit that has no retry time", () => {
    expect(syncNotice(state({ status: "rate_limited" }), NOW)?.detail).toBe("It will retry on the next sync.");
  });

  it("calls out an expired key specifically, since that is the one the user can fix", () => {
    const notice = syncNotice(state({ status: "error", last_error: "Riot key invalid/expired" }), NOW);
    expect(notice).toMatchObject({ tone: "error" });
    expect(notice?.title).toMatch(/key invalid or expired/i);
    expect(notice?.detail).toMatch(/Personal key/);
  });

  it("passes any other error through rather than swallowing it", () => {
    expect(syncNotice(state({ status: "error", last_error: "Riot 503" }), NOW)).toEqual({
      tone: "error",
      title: "Last sync failed — showing cached data.",
      detail: "Riot 503",
    });
    expect(syncNotice(state({ status: "error", last_error: null }), NOW)?.detail).toBeUndefined();
  });
});
