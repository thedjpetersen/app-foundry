// Worker-side enforcement for the core access-control model, kept generic:
// the host resolves who the caller is and what they can do; these helpers
// turn that into 401/403 responses, double-submit CSRF checks, and a
// fixed-window D1 rate limiter. No table names or permission strings are
// baked in — the consumer owns its schema and registry.

import {
  authorize,
  type AuthorizeOptions,
  type Permission,
} from "../core/access-control.js";
import { jsonError } from "./http.js";

export type RequireCapabilityInput = {
  effective: ReadonlySet<Permission>;
  opts?: AuthorizeOptions;
  permission: Permission;
};

export type CapabilityGuard = (
  request: Request,
  permission: Permission,
  opts?: AuthorizeOptions
) => Promise<Response | null>;

/**
 * The consumer's job: turn a request into the caller's effective permission
 * set, or null/undefined when the request carries no valid session.
 */
export type EffectivePermissionResolver = (
  request: Request
) =>
  | Promise<ReadonlySet<Permission> | null | undefined>
  | ReadonlySet<Permission>
  | null
  | undefined;

/**
 * Null means proceed; otherwise a 403 JSON response carrying the denial
 * reason. Callers that must not leak resource existence should catch the 403
 * and swap in their own 404.
 */
export function requireCapability({
  effective,
  opts,
  permission,
}: RequireCapabilityInput): Response | null {
  const result = authorize(effective, permission, opts);

  if (result.allowed) {
    return null;
  }

  return jsonError("Forbidden", 403, {
    permission,
    reason: result.reason,
  });
}

/**
 * Binds a resolver once so route handlers read as
 * `const denied = await guard(request, "member:remove"); if (denied) return denied;`.
 * No session is a 401; a session without the capability is a 403.
 */
export function createCapabilityGuard(
  resolveEffective: EffectivePermissionResolver
): CapabilityGuard {
  return async (request, permission, opts) => {
    const effective = await resolveEffective(request);

    if (!effective) {
      return jsonError("Authentication required", 401);
    }

    return requireCapability({ effective, opts, permission });
  };
}

// --- CSRF (double-submit cookie) -----------------------------------------
//
// The token lives in a cookie the page's own JavaScript can read and must be
// echoed back in a request header. Cross-origin pages can force the cookie to
// be *sent* but cannot read it to build the header, so a matching pair proves
// same-origin intent. The cookie is therefore deliberately NOT HttpOnly.

export const DEFAULT_CSRF_COOKIE_NAME = "csrf_token";
export const DEFAULT_CSRF_HEADER_NAME = "x-csrf-token";

export type IssueCsrfCookieOptions = {
  cookieName?: string;
  /** @default 60 * 60 * 24 * 30 (30 days) */
  maxAgeSeconds?: number;
  path?: string;
  sameSite?: "Lax" | "Strict";
  secure?: boolean;
  token: string;
};

export type VerifyCsrfOptions = {
  cookieName?: string;
  headerName?: string;
};

/** Cryptographically random, URL-safe CSRF token (hex). */
export function generateCsrfToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));

  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Set-Cookie header value for a readable (non-HttpOnly) CSRF token. */
export function issueCsrfCookie({
  cookieName = DEFAULT_CSRF_COOKIE_NAME,
  maxAgeSeconds = 60 * 60 * 24 * 30,
  path = "/",
  sameSite = "Lax",
  secure = true,
  token,
}: IssueCsrfCookieOptions): string {
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${sameSite}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * True only when the request carries both the CSRF cookie and the CSRF
 * header and they match (constant-time). Anything missing or mismatched is
 * false — the caller turns that into a 403.
 */
export function verifyCsrf(
  request: Request,
  {
    cookieName = DEFAULT_CSRF_COOKIE_NAME,
    headerName = DEFAULT_CSRF_HEADER_NAME,
  }: VerifyCsrfOptions = {}
): boolean {
  const headerToken = request.headers.get(headerName);
  const cookieToken = readCookie(request.headers.get("Cookie"), cookieName);

  if (!headerToken || !cookieToken) {
    return false;
  }

  return constantTimeEqual(headerToken, cookieToken);
}

/**
 * Timing-safe string comparison: always walks the longer input and folds the
 * length difference into the accumulator, so neither prefix matches nor
 * length reveal themselves through timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let difference = aBytes.length ^ bBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }

  return difference === 0;
}

// --- Fixed-window rate limiting on D1 -------------------------------------
//
// One row per key, self-resetting: the upsert's CASE compares the stored
// window to the current one, so a stale row restarts at 1 instead of
// needing a cleanup job. The consumer owns the table and its migration;
// `buildRateLimitTableSql` states the expected shape.

export type RateLimitDefaults = {
  /** @default 10 */
  limit?: number;
  /** @default 60 */
  windowSeconds?: number;
};

export type RateLimitCheckOptions = RateLimitDefaults & {
  /** Override the clock (epoch milliseconds), mainly for tests. */
  now?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the current window resets; 0 when allowed. */
  retryAfter: number;
};

export type D1RateLimiter = {
  check: (
    key: string,
    options?: RateLimitCheckOptions
  ) => Promise<RateLimitResult>;
};

export type D1RateLimiterOptions = {
  db: D1Database;
  defaults?: RateLimitDefaults;
  /** @default "rate_limits" */
  table?: string;
};

/** The DDL the consumer's migration must provide for a limiter table. */
export function buildRateLimitTableSql(table = "rate_limits"): string {
  assertSqlIdentifier(table);

  return `CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0)`;
}

/**
 * Fixed-window limiter: `check` increments the key's counter for the current
 * window in a single upsert and reports whether it stayed within the limit.
 * Empty keys bypass the limiter entirely, so callers can pass "" when there
 * is no meaningful client identity to bucket by. D1 failures propagate — the
 * consumer decides whether a broken limiter fails open or closed.
 */
export function createD1RateLimiter({
  db,
  defaults = {},
  table = "rate_limits",
}: D1RateLimiterOptions): D1RateLimiter {
  assertSqlIdentifier(table);

  const statement = `INSERT INTO ${table} (key, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END, window_start = ?2 RETURNING count`;

  return {
    async check(key, options = {}) {
      if (!key) {
        return { allowed: true, retryAfter: 0 };
      }

      const limit = options.limit ?? defaults.limit ?? 10;
      const windowSeconds =
        options.windowSeconds ?? defaults.windowSeconds ?? 60;
      const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
      const windowStart =
        Math.floor(nowSeconds / windowSeconds) * windowSeconds;

      const row = await db
        .prepare(statement)
        .bind(key, windowStart)
        .first<{ count: number }>();

      const count = row?.count ?? Number.POSITIVE_INFINITY;

      if (count <= limit) {
        return { allowed: true, retryAfter: 0 };
      }

      return {
        allowed: false,
        retryAfter: Math.max(1, windowStart + windowSeconds - nowSeconds),
      };
    },
  };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
  }

  return null;
}

function assertSqlIdentifier(value: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
}
