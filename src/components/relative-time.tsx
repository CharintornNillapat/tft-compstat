"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * "3m ago" for a timestamp, formatted on the client. A server-rendered relative
 * time is wrong the moment it's cached, so the server passes the ISO string and
 * the browser does the arithmetic against its own clock.
 */

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelative(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(seconds) < 60 ? [seconds, "second"]
    : Math.abs(seconds) < 3600 ? [Math.round(seconds / 60), "minute"]
    : Math.abs(seconds) < 86400 ? [Math.round(seconds / 3600), "hour"]
    : [Math.round(seconds / 86400), "day"];
  return RELATIVE.format(value, unit);
}

/** `mm:ss` remaining, or null once the moment has passed. */
export function formatCountdown(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const remaining = Math.ceil((Date.parse(iso) - now) / 1000);
  if (remaining <= 0) return null;
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
}

/**
 * The current time, ticking every `intervalMs`, as an external store — the clock is
 * exactly the "external system" `useSyncExternalStore` is for.
 *
 * Null on the server and during hydration, so both renders agree; the real value
 * arrives on the first tick after mount.
 */
export function useNow(intervalMs = 1000): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );
  // Snapped to the interval so repeated calls between ticks return an identical
  // value; a freely-changing snapshot would re-render forever.
  const getSnapshot = useCallback(() => Math.floor(Date.now() / intervalMs) * intervalMs, [intervalMs]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function RelativeTime({ iso, fallback = "—" }: { iso: string | null; fallback?: string }) {
  const now = useNow(30_000);
  if (now === null) return <span suppressHydrationWarning>{iso ? "…" : fallback}</span>;
  return (
    <time dateTime={iso ?? undefined} suppressHydrationWarning>
      {formatRelative(iso, now)}
    </time>
  );
}
