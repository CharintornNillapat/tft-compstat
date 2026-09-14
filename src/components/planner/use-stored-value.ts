"use client";

import { useSyncExternalStore } from "react";

/*
 * localStorage as an external store (architecture §8, Phase 6 Task 16). The planner's
 * draft and saved comps are *read from here on every render* rather than copied into
 * React state, so a reload, another tab and this tab all see the same value with no
 * effect syncing them.
 *
 * Every access is guarded: storage can be blocked (private windows, disabled site
 * data) or full. Writes always land in an in-memory copy first, so the planner keeps
 * working for the life of the tab and `writeStored` reports that nothing persisted.
 */

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab wrote: drop our copy so the next read goes back to storage.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null) memory.clear();
    else memory.delete(event.key);
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored string, null when unset, and undefined until hydrated (the server has no storage). */
export function useStoredValue(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => undefined,
  );
}

/** Stores a value for this tab and tries to persist it; false when it could not be persisted. */
export function writeStored(key: string, value: string): boolean {
  memory.set(key, value);
  let persisted = true;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    persisted = false;
  }
  for (const listener of listeners) listener();
  return persisted;
}
