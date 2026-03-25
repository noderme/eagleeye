/**
 * Centralized error message sanitizer.
 * Converts raw API/SDK errors into short, plain-English messages
 * safe to show directly in the UI.
 */

interface ErrorRule {
  match: (msg: string) => boolean;
  message: string;
}

const RULES: ErrorRule[] = [
  // ── Auth / key errors ────────────────────────────────────────────────────
  {
    match: m => /401|invalid_api_key|API key not valid|API_KEY_INVALID|Unauthorized/i.test(m),
    message: "Invalid API key — double-check it and try again.",
  },
  {
    match: m => /403|Forbidden|insufficient_quota|permission/i.test(m),
    message: "Access denied — your key may not have the required permissions.",
  },

  // ── Quota / rate limits ──────────────────────────────────────────────────
  {
    match: m => /429|Too Many Requests|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(m),
    message: "Rate limit or quota exceeded — your free tier is full. Add billing or wait for the quota to reset.",
  },

  // ── Network / timeout ────────────────────────────────────────────────────
  {
    match: m => /timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|network|fetch failed/i.test(m),
    message: "Network error — couldn't reach the provider. Check your connection and try again.",
  },

  // ── Server errors ────────────────────────────────────────────────────────
  {
    match: m => /5[0-9]{2}|Internal Server Error|server error/i.test(m),
    message: "The provider returned a server error. Try again in a moment.",
  },

  // ── Supabase specific ────────────────────────────────────────────────────
  {
    match: m => /relation .* does not exist|no such table/i.test(m),
    message: "Database not set up yet — run the Supabase migration SQL first.",
  },
  {
    match: m => /JWT|session|not authenticated/i.test(m),
    message: "Your session expired — please sign in again.",
  },

  // ── Encryption ───────────────────────────────────────────────────────────
  {
    match: m => /ENCRYPTION_KEY/i.test(m),
    message: "Server configuration error — ENCRYPTION_KEY is not set. Contact the app owner.",
  },

  // ── GitHub ───────────────────────────────────────────────────────────────
  {
    match: m => /Bad credentials|GitHub.*401/i.test(m),
    message: "GitHub token is invalid or expired — sign out and sign in again.",
  },
  {
    match: m => /GitHub.*404|Not Found.*github/i.test(m),
    message: "GitHub resource not found — it may have been deleted or you don't have access.",
  },
];

/**
 * Returns a short, user-friendly error message.
 * Falls back to a truncated version of the raw message if no rule matches.
 */
export function friendlyError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "Unknown error");

  for (const rule of RULES) {
    if (rule.match(msg)) return rule.message;
  }

  // Fallback: strip noise and truncate
  const cleaned = msg
    .replace(/\[GoogleGenerativeAI Error\]:\s*/gi, "")
    .replace(/Error fetching from https?:\/\/[^\s]+:\s*/gi, "")
    .replace(/\{[^}]*\}/g, "") // strip JSON blobs
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length > 100 ? cleaned.slice(0, 100) + "…" : cleaned || "An unexpected error occurred.";
}

/**
 * Wraps an async function and returns { data, error } — never throws.
 * `error` is always a user-friendly string if set.
 */
export async function safeRun<T>(
  fn: () => Promise<T>
): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: friendlyError(e) };
  }
}
