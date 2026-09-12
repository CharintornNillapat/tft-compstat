/**
 * Riot API error types (architecture §5.2). Each one drives a different
 * `sync_state.status`, so `SyncService` branches on the class, not the status code.
 */

export class RiotError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 429. `retryAfterS` comes from `Retry-After`, defaulting to a conservative wait. */
export class RateLimited extends RiotError {
  constructor(
    readonly retryAfterS: number,
    status: number,
    url: string,
    /** Which bucket tripped, from `X-Rate-Limit-Type`: 'application' | 'method' | 'service'. */
    readonly limitType?: string,
  ) {
    super(`Rate limited for ${retryAfterS}s${limitType ? ` (${limitType} limit)` : ""}`, status, url);
  }
}

/** 401/403 — almost always an expired development key. Cached data is still served. */
export class AuthError extends RiotError {
  constructor(status: number, url: string) {
    super("Riot key invalid/expired", status, url);
  }
}

/** 5xx and network failures. Retried a little; never fatal to the cached site. */
export class ServerError extends RiotError {}

/** 404 — a Riot ID that doesn't exist, or an account with no data on this host. */
export class NotFoundError extends RiotError {
  constructor(url: string) {
    super("Not found", 404, url);
  }
}

/** The per-run call cap (§5.2 layer 2) tripped. A bug guard, not an API response. */
export class BudgetExceeded extends Error {
  constructor(readonly budget: number) {
    super(`Riot call budget of ${budget} exhausted in one sync run`);
    this.name = "BudgetExceeded";
  }
}
