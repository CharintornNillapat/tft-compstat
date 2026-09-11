import { must, type QueryResult } from "@/lib/supabase/result";

export { must };

/** Reads every row of a query; PostgREST caps each response (1000 rows on Supabase). */
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<QueryResult<T[]>>,
  context: string,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const batch = must(await page(from, from + pageSize - 1), context);
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
