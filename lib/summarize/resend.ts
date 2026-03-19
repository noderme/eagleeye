export function summarizeResend(data: any): string {
  if (!data || data.error) return "";

  const parts = [`Resend: ${data.domainCount} email domain(s)`];

  const unverified = (data.domains ?? []).filter((d: any) => d.status !== "verified");
  if (unverified.length > 0) {
    parts.push(`${unverified.length} unverified: ${unverified.map((d: any) => d.name).join(", ")}`);
  }

  return parts.join(", ");
}
