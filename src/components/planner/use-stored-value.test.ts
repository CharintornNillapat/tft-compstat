import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The planner's localStorage store under the failures real browsers produce: a full
 * quota (`QuotaExceededError` on write) and blocked storage (`SecurityError` on touching
 * `window.localStorage` at all — site data disabled, some private modes). The suite has
 * no DOM, so each test stubs `window` with Map-backed storage.
 */

type StorageListener = (event: { key: string | null }) => void;

function stubWindow(options: { blocked?: boolean; full?: boolean } = {}) {
  const data = new Map<string, string>();
  const storageListeners = new Set<StorageListener>();
  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.full) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      data.set(key, value);
    },
  };
  vi.stubGlobal("window", {
    get localStorage() {
      if (options.blocked) throw new DOMException("The operation is insecure.", "SecurityError");
      return localStorage;
    },
    addEventListener: (_type: string, listener: StorageListener) => storageListeners.add(listener),
    removeEventListener: (_type: string, listener: StorageListener) => storageListeners.delete(listener),
  });
  return {
    data,
    storageListeners,
    /** Another tab changed `key`; null is its `localStorage.clear()`. */
    otherTabWrote: (key: string | null) => storageListeners.forEach((listener) => listener({ key })),
  };
}

// The store keeps a module-level copy for the tab, so every test starts from a fresh module.
let store: typeof import("./use-stored-value");
beforeEach(async () => {
  vi.resetModules();
  store = await import("./use-stored-value");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const KEY = "tft-compstat:test";

describe("stored values", () => {
  it("persists a write and reads it back", () => {
    const { data } = stubWindow();
    expect(store.writeStored(KEY, "a")).toBe(true);
    expect(data.get(KEY)).toBe("a");
    expect(store.readStored(KEY)).toBe("a");
  });

  it("reads what an earlier visit stored, and null for a key never written", () => {
    const { data } = stubWindow();
    data.set(KEY, "saved");
    expect(store.readStored(KEY)).toBe("saved");
    expect(store.readStored("tft-compstat:missing")).toBeNull();
  });

  it("keeps a write for this tab when the quota is exceeded, and reports it did not persist", () => {
    const { data } = stubWindow({ full: true });
    const onChange = vi.fn();
    store.subscribeStored(onChange);
    expect(store.writeStored(KEY, "a")).toBe(false);
    expect(data.has(KEY)).toBe(false);
    expect(store.readStored(KEY)).toBe("a");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("treats blocked storage as empty without throwing, and still works for the tab", () => {
    stubWindow({ blocked: true });
    expect(store.readStored(KEY)).toBeNull();
    expect(store.writeStored(KEY, "a")).toBe(false);
    expect(store.readStored(KEY)).toBe("a");
  });

  it("drops this tab's copy when another tab writes the key", () => {
    const { data, otherTabWrote } = stubWindow();
    const onChange = vi.fn();
    store.subscribeStored(onChange);
    store.writeStored(KEY, "mine");
    data.set(KEY, "theirs");
    otherTabWrote(KEY);
    expect(store.readStored(KEY)).toBe("theirs");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("drops every copy when another tab clears storage", () => {
    const { data, otherTabWrote } = stubWindow();
    store.subscribeStored(() => {});
    store.writeStored("tft-compstat:a", "1");
    store.writeStored("tft-compstat:b", "2");
    data.clear();
    otherTabWrote(null);
    expect(store.readStored("tft-compstat:a")).toBeNull();
    expect(store.readStored("tft-compstat:b")).toBeNull();
  });

  it("stops listening for other tabs when unsubscribed", () => {
    const { storageListeners } = stubWindow();
    const unsubscribe = store.subscribeStored(() => {});
    expect(storageListeners.size).toBe(1);
    unsubscribe();
    expect(storageListeners.size).toBe(0);
  });
});
