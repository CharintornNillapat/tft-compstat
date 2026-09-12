/**
 * Stands in for the `server-only` package under Vitest.
 *
 * `server-only` throws unless it's resolved with the `react-server` condition, which
 * is how Next builds Server Components and how the scripts run (architecture §10).
 * Tests import server modules directly, so the guard is aliased away here rather than
 * removed from the source, where it still does its job at build time.
 */
export {};
