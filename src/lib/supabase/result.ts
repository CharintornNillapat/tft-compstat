import type { PostgrestSingleResponse } from "@supabase/supabase-js";

/** Any awaited supabase-js query: success carries `data`, failure carries `error`. */
export type QueryResult<T> = PostgrestSingleResponse<T>;

/** Unwraps a supabase-js result, throwing with context instead of returning `error`. */
export function must<T>(result: QueryResult<T>, context: string): T {
  if (result.error) {
    const { message, details } = result.error;
    throw new Error(`${context}: ${message}${details ? ` (${details})` : ""}`);
  }
  return result.data;
}
