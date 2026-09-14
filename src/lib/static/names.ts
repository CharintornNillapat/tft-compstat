/**
 * Display names, icons and costs keyed by api name (architecture §6.3). Pure and
 * client-safe: `src/lib/static/lookup.ts` builds the book on the server behind
 * `"use cache"`, and `pickNames` trims it to what a page actually references before
 * it crosses to the browser.
 *
 * `Record` rather than `Map` on purpose — it's the smaller Flight encoding, it
 * survives the `"use cache"` round trip without thought, and a test can write one
 * as an object literal.
 */

export type ChampionRef = { name: string; cost: number; iconUrl: string | null };
export type NameRef = { name: string; iconUrl: string | null };

export type NameBook = {
  champions: Record<string, ChampionRef>;
  traits: Record<string, NameRef>;
  items: Record<string, NameRef>;
};

/**
 * Lookups never throw and never render blank. An api name missing from the static
 * tables falls back to itself, which is ugly but honest and easy to spot — a match
 * from an older set, or a sync that ran before `pnpm sync:static`.
 */
export function championRef(book: NameBook, apiName: string): ChampionRef {
  return book.champions[apiName] ?? { name: apiName, cost: 0, iconUrl: null };
}

export function traitRef(book: NameBook, apiName: string): NameRef {
  return book.traits[apiName] ?? { name: apiName, iconUrl: null };
}

export function itemRef(book: NameBook, apiName: string): NameRef {
  return book.items[apiName] ?? { name: apiName, iconUrl: null };
}

/**
 * Adapter for `signatureLabel` in `sync/comp-signature.ts`, which wants resolvers
 * returning `undefined` for an unknown name so it can apply its own fallback.
 */
export function labelNames(book: NameBook): {
  trait: (apiName: string) => string | undefined;
  champion: (apiName: string) => string | undefined;
} {
  return {
    trait: (apiName) => book.traits[apiName]?.name,
    champion: (apiName) => book.champions[apiName]?.name,
  };
}

function pick<T>(source: Record<string, T>, keys: Iterable<string> | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of keys ?? []) {
    const value = source[key];
    // A missing key is simply absent; the `*Ref` accessors handle it at render time.
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * The subset of the book the given api names reference. The full book holds every
 * item in the set (771 in Set 18), which must never be shipped to the browser.
 */
export function pickNames(
  book: NameBook,
  used: { champions?: Iterable<string>; traits?: Iterable<string>; items?: Iterable<string> },
): NameBook {
  return {
    champions: pick(book.champions, used.champions),
    traits: pick(book.traits, used.traits),
    items: pick(book.items, used.items),
  };
}
