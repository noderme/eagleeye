// Returns a key expiry line for any provider, or empty string if no expiry set
export function summarizeKeyExpiry(provider: string, extraConfig: Record<string, any> | null): string {
  const expiresAt = extraConfig?.keyExpiresAt;
  if (!expiresAt) return "";

  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return `${provider} API key: EXPIRED ${Math.abs(days)} days ago`;
  if (days === 0) return `${provider} API key: expires TODAY`;
  return `${provider} API key: expires in ${days} day${days !== 1 ? "s" : ""} (${expiresAt})`;
}

// Returns minimum days across all provider key expiries — used for safety floor
export function minKeyExpiryDays(keyMeta: Record<string, Record<string, any> | null>): number | null {
  const days = Object.values(keyMeta)
    .map(m => m?.keyExpiresAt)
    .filter(Boolean)
    .map((iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
    .filter(d => d > 0);
  return days.length > 0 ? Math.min(...days) : null;
}
