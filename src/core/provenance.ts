// Content provenance in three states, chosen so an API can distinguish
// "clear it" from "leave it alone": `null` means a human wrote this,
// a string names the AI source that did, and `undefined` means the caller
// said nothing about it. The framework normalizes and displays; whether
// attribution is *required* stays host product policy.

export const AI_ATTRIBUTION_MAX_LENGTH = 200;

/** null means human-written; a string names the AI source of the text. */
export type AiAttribution = string | null;

/**
 * Normalize an attribution value from untrusted input (API bodies, form
 * state). null clears attribution, strings are trimmed and capped, anything
 * else returns undefined so callers can treat the field as "not provided".
 */
export function normalizeAiAttribution(
  value: unknown,
  maxLength = AI_ATTRIBUTION_MAX_LENGTH,
): AiAttribution | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const attribution = value.trim();

  return attribution.length > 0 ? attribution.slice(0, maxLength) : null;
}
