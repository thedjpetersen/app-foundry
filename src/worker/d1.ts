// Three tiny helpers, one purpose: fail loudly at the boundary. A missing
// or misconfigured D1 binding should be a clear startup error naming the
// binding, not an `undefined is not an object` five calls deep.

export function requireD1Database<Env extends Record<string, unknown>>(
  env: Env,
  binding: keyof Env & string
): D1Database {
  const database = env[binding];

  if (!isD1Database(database)) {
    throw new Error(`Missing D1 database binding: ${binding}`);
  }

  return database;
}

// `batch` gives multi-statement writes a single transactional round trip;
// the empty-array guard exists because D1 rejects empty batches and "no
// statements" is a legitimate state for callers that build them up
// conditionally.
export async function runD1Batch(
  database: D1Database,
  statements: D1PreparedStatement[]
): Promise<D1Result[]> {
  if (statements.length === 0) {
    return [];
  }

  return database.batch(statements);
}

export function prepareD1Statement(
  database: D1Database,
  sql: string,
  ...bindings: unknown[]
): D1PreparedStatement {
  return database.prepare(sql).bind(...bindings);
}

function isD1Database(value: unknown): value is D1Database {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    "batch" in value
  );
}
