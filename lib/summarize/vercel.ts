export function summarizeVercel(data: any): string {
  if (!data || data.error) return "";

  const label = data.teamName ? `Vercel (${data.teamName})` : "Vercel";
  const parts = [`${label}: plan=${data.plan}`];

  if (data.projectCount != null) parts.push(`${data.projectCount} project(s)`);

  if (data.billingPeriodEnd) {
    const days = Math.ceil((new Date(data.billingPeriodEnd).getTime() - Date.now()) / 86400000);
    if (days <= 14) parts.push(`billing period ends in ${days} days`);
  }

  return parts.join(", ");
}
