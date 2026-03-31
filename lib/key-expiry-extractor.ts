/**
 * Best-effort expiry extraction from a raw credential string.
 * Tries known self-describing formats without any user input.
 * Returns an ISO string if expiry is found, null otherwise.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const UNIX_SEC_RE = /^\d{10}$/;
const UNIX_MS_RE = /^\d{13}$/;

/** Normalize a raw value to an ISO string if it looks like a timestamp. */
function normalizeTimestamp(raw: unknown): string | null {
  if (typeof raw === "number") {
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw === "string") {
    if (ISO_RE.test(raw)) {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (UNIX_SEC_RE.test(raw)) return new Date(Number(raw) * 1000).toISOString();
    if (UNIX_MS_RE.test(raw)) return new Date(Number(raw)).toISOString();
  }
  return null;
}

/** JWT: header.payload.signature — exp claim in payload */
function tryJwt(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return normalizeTimestamp(json.exp ?? json.expires_at ?? json.expiry ?? null);
  } catch {
    return null;
  }
}

/** Base64-encoded JSON blob — some providers encode credentials this way */
function tryBase64Json(value: string): string | null {
  // Must look like a pure base64 string (no dots = not JWT)
  if (!/^[A-Za-z0-9+/=_-]{20,}$/.test(value) || value.includes(".")) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (value.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    if (!decoded.includes("{")) return null;
    const json = JSON.parse(decoded);
    const raw =
      json.exp ?? json.expires_at ?? json.expiry ?? json.expiration ??
      json.valid_until ?? json.expire_time ?? json.token_expiry ?? null;
    return normalizeTimestamp(raw);
  } catch {
    return null;
  }
}

/** Plain ISO date string as a credential field value (e.g. an "expires_at" field) */
function tryIsoString(value: string): string | null {
  if (ISO_RE.test(value.trim())) {
    const d = new Date(value.trim());
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Plain Unix timestamp string as a credential field value */
function tryUnixTimestamp(value: string): string | null {
  const trimmed = value.trim();
  if (UNIX_SEC_RE.test(trimmed)) return new Date(Number(trimmed) * 1000).toISOString();
  if (UNIX_MS_RE.test(trimmed)) return new Date(Number(trimmed)).toISOString();
  return null;
}

/**
 * Try all string values in a credentials object.
 * Runs every detector in priority order and returns the first hit.
 */
export function tryExtractExpiryFromCredentials(
  creds: Record<string, string>
): string | null {
  // Check field names first — a field literally named "expires_at" / "expiration" / etc.
  // is very likely to contain the expiry, even if its value is just an ISO string
  const EXPIRY_FIELD_HINTS = ["expires_at", "expiration", "expiry", "expire_time", "valid_until", "token_expiry"];

  for (const [key, value] of Object.entries(creds)) {
    if (typeof value !== "string") continue;
    if (EXPIRY_FIELD_HINTS.some(hint => key.toLowerCase().includes(hint))) {
      const found = tryIsoString(value) ?? tryUnixTimestamp(value);
      if (found) return found;
    }
  }

  // Fall back to trying each value with all detectors
  for (const value of Object.values(creds)) {
    if (typeof value !== "string" || value.length < 10) continue;

    const found =
      tryJwt(value) ??
      tryBase64Json(value) ??
      tryIsoString(value) ??
      tryUnixTimestamp(value);

    if (found) return found;
  }

  return null;
}