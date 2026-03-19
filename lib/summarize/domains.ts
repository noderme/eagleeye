export function summarizeDomains(domains: any[]): string {
  if (!domains || domains.length === 0) return "";

  const lines = domains.map(d => {
    if (d.error) return `  ${d.domain}: lookup failed (${d.error})`;
    if (d.daysLeft == null) return `  ${d.domain}: expiry date unknown`;
    const urgency = d.daysLeft <= 7 ? " 🚨 CRITICAL" : d.daysLeft <= 30 ? " ⚠️ URGENT" : "";
    return `  ${d.domain}: expires in ${d.daysLeft} days${urgency}`;
  });

  return [`Domains (${domains.length} monitored):`, ...lines].join("\n");
}

// Returns the minimum days-until-expiry across all domains — used for safety floor
export function minDomainDaysLeft(domains: any[]): number | null {
  const valid = domains
    .map(d => d.daysLeft)
    .filter((d): d is number => d != null && d > 0);
  return valid.length > 0 ? Math.min(...valid) : null;
}
