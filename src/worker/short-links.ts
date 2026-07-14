// Short links are a platform-wide affordance, so their three parts live
// together: code generation for artifacts (`D7KQ2M9X`), readable codes for
// humans to say out loud (`kfq4-x2mh`), and the route that turns
// `/d/<code>` back into an app route. The React package's `ShareCodeChip`
// is the display half of the same contract.

import {
  jsonError,
  type WorkerRequestContext,
  type WorkerRoute,
} from "./http.js";

/** Opaque share codes: unambiguous in URLs, screams "identifier". */
export const OPAQUE_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Read-aloud codes: lowercase, no 0/O, 1/l, or i lookalikes. */
export const READABLE_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type ShortCodeOptions = {
  alphabet?: string;
  length?: number;
  prefix?: string;
};

export type ReadableCodeOptions = {
  alphabet?: string;
  groupCount?: number;
  groupLength?: number;
  separator?: string;
};

export type ShortLinkRouteOptions<Env = unknown> = {
  /** Regex fragment the code segment must match. @default "[A-Za-z0-9_-]+" */
  codePattern?: string;
  /** Redirect status. @default 302 */
  status?: number;
  notFound?: (
    context: WorkerRequestContext<Env>,
  ) => Response | Promise<Response>;
  pathPrefix: string;
  resolve: (
    code: string,
    context: WorkerRequestContext<Env>,
  ) =>
    | Promise<string | null | undefined>
    | string
    | null
    | undefined;
};

/**
 * Cryptographically random short code, e.g. `generateShortCode({ prefix: "D" })`
 * -> "D7KQ2M9X". Sampling is rejection-based so every character is uniform.
 */
export function generateShortCode({
  alphabet = OPAQUE_CODE_ALPHABET,
  length = 7,
  prefix = "",
}: ShortCodeOptions = {}): string {
  return `${prefix}${randomCharacters(alphabet, length)}`;
}

/**
 * Human-friendly code in separated groups, e.g. "kfq4-x2mh" — meant to be
 * read aloud (meeting joins, pairing codes).
 */
export function generateReadableCode({
  alphabet = READABLE_CODE_ALPHABET,
  groupCount = 2,
  groupLength = 4,
  separator = "-",
}: ReadableCodeOptions = {}): string {
  const groups: string[] = [];

  for (let index = 0; index < groupCount; index += 1) {
    groups.push(randomCharacters(alphabet, groupLength));
  }

  return groups.join(separator);
}

/**
 * Route that resolves `<pathPrefix>/<code>` to an app route and redirects,
 * for use with `createWorkerRouter`. `resolve` returning null/undefined
 * yields the `notFound` response (default: JSON 404).
 */
export function createShortLinkRoute<Env = unknown>({
  codePattern = "[A-Za-z0-9_-]+",
  notFound,
  pathPrefix,
  resolve,
  status = 302,
}: ShortLinkRouteOptions<Env>): WorkerRoute<Env> {
  const prefix = pathPrefix.endsWith("/")
    ? pathPrefix.slice(0, -1)
    : pathPrefix;

  return {
    method: "GET",
    pathname: new RegExp(`^${escapeRegExp(prefix)}/(?<code>${codePattern})$`),
    handle: async (context) => {
      // Codes travel in URLs, so they arrive percent-encoded; the resolver
      // sees the human form.
      const target = await resolve(
        decodeURIComponent(context.params.code),
        context,
      );

      if (!target) {
        return notFound
          ? notFound(context)
          : jsonError("Short link not found", 404);
      }

      // Resolvers return app routes ("/app/docs/d/…"); resolving against
      // the request origin turns them into the absolute URL a redirect
      // needs.
      return Response.redirect(
        new URL(target, context.url.origin).toString(),
        status,
      );
    },
  };
}

function randomCharacters(alphabet: string, count: number): string {
  if (alphabet.length < 2 || alphabet.length > 256) {
    throw new Error("Short code alphabet must have 2-256 characters.");
  }

  if (count < 1) {
    throw new Error("Short codes must be at least 1 character long.");
  }

  // Reject bytes above the largest multiple of the alphabet size so modulo
  // never skews toward the alphabet's first characters.
  const limit = 256 - (256 % alphabet.length);
  const characters: string[] = [];

  while (characters.length < count) {
    const bytes = crypto.getRandomValues(
      new Uint8Array(count - characters.length + 8),
    );

    for (const byte of bytes) {
      if (byte < limit && characters.length < count) {
        characters.push(alphabet[byte % alphabet.length]);
      }
    }
  }

  return characters.join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
