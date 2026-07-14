// The Worker helpers stay small on principle: a router that is a `for`
// loop, JSON helpers that set the right headers, and body readers that
// never throw on garbage input. Bindings, schemas, auth, and deployment
// topology are host-product decisions — nothing here hides them.

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = Record<string, JsonValue>;

export type WorkerRequestContext<Env = unknown> = {
  ctx: ExecutionContext;
  env: Env;
  params: Record<string, string>;
  request: Request;
  url: URL;
};

// A route is a pathname (exact string or regex), an optional method
// filter, and a handler. Regex named groups become `params` — that is the
// entire parameter system, and it is enough for API surfaces this size.
export type WorkerRoute<Env = unknown> = {
  handle: (context: WorkerRequestContext<Env>) => Response | Promise<Response>;
  method?: string | string[];
  pathname: string | RegExp;
};

export type WorkerRouterOptions<Env = unknown> = {
  assets?: (env: Env) => Fetcher | undefined;
  health?: {
    name: string;
    path?: string;
  };
  notFound?: (context: WorkerRequestContext<Env>) => Response | Promise<Response>;
  routes: WorkerRoute<Env>[];
};

export function json<TBody extends JsonValue>(
  body: TBody,
  init: ResponseInit = {}
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function jsonError(
  error: string,
  status = 400,
  extras: JsonObject = {}
): Response {
  return json(
    {
      error,
      ...extras,
    },
    { status }
  );
}

// Defensive by contract: malformed JSON, a non-object body, or no body at
// all each collapse to `{}` rather than a thrown error. Handlers then use
// `getText`/`getNullableText` to pull fields, so validation failures are
// expressed as 400 responses instead of Worker exceptions.
export async function readJsonObject(request: Request): Promise<JsonObject> {
  const body = await request.json().catch(() => ({}));

  return isRecord(body) ? (body as JsonObject) : {};
}

// The pair encodes PATCH semantics: `getText` treats absent and blank as
// "not provided" (`undefined`), while `getNullableText` lets an explicit
// `null` through as "clear this field" — the same three-state contract
// the AI-attribution helpers use.
export function getText(body: JsonObject, key: string): string | undefined {
  const value = body[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function getNullableText(body: JsonObject, key: string): string | null {
  const value = body[key];

  if (value === null) {
    return null;
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Canonical-host guard for the top of a fetch handler: requests to the
// `www.` host 301 to the apex with path and query intact; anything else
// returns null and the router proceeds normally.
export function redirectToApex({
  apexHost,
  request,
  wwwHost = `www.${apexHost}`,
}: {
  apexHost: string;
  request: Request;
  wwwHost?: string;
}): Response | null {
  const url = new URL(request.url);

  if (url.hostname !== wwwHost) {
    return null;
  }

  url.hostname = apexHost;
  return Response.redirect(url.toString(), 301);
}

export function createHealthResponse(name: string): Response {
  return json({
    name,
    runtime: "cloudflare-workers",
    status: "ok",
  });
}

// The router's dispatch order is the whole story: health check first,
// then routes in declaration order (first match wins), then the static
// asset fetcher if the env provides one, then 404. No middleware chain,
// no route trees — a product that outgrows this should write its own
// dispatch, not configure this one harder.
export function createWorkerRouter<Env>({
  assets,
  health,
  notFound,
  routes,
}: WorkerRouterOptions<Env>) {
  return async (
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> => {
    const url = new URL(request.url);

    if (health && request.method === "GET" && url.pathname === (health.path ?? "/api/health")) {
      return createHealthResponse(health.name);
    }

    for (const route of routes) {
      const params = matchRoute(route, request.method, url.pathname);

      if (!params) {
        continue;
      }

      return route.handle({
        ctx,
        env,
        params,
        request,
        url,
      });
    }

    const assetFetcher = assets?.(env);

    if (assetFetcher) {
      return assetFetcher.fetch(request);
    }

    return notFound
      ? notFound({ ctx, env, params: {}, request, url })
      : jsonError("Not found", 404);
  };
}

function matchRoute<Env>(
  route: WorkerRoute<Env>,
  method: string,
  pathname: string
): Record<string, string> | null {
  const allowedMethods = Array.isArray(route.method)
    ? route.method
    : route.method
      ? [route.method]
      : undefined;

  if (
    allowedMethods &&
    !allowedMethods.some((allowedMethod) => allowedMethod === method)
  ) {
    return null;
  }

  if (typeof route.pathname === "string") {
    return route.pathname === pathname ? {} : null;
  }

  const match = pathname.match(route.pathname);

  if (!match) {
    return null;
  }

  // Named groups arrive under their names; unnamed groups are still
  // reachable as "1", "2", … so quick regexes work without ceremony.
  return {
    ...(match.groups ?? {}),
    ...Object.fromEntries(
      match.slice(1).map((value, index) => [String(index + 1), value])
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
