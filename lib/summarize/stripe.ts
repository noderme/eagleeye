export function summarizeStripe(data: any): string {
  if (!data || data.error) return "";

  const parts = [`Stripe: ${data.activeSubscriptions} active subscription(s)`];

  if (data.monthlyRecurringRevenue > 0) {
    parts.push(`MRR $${data.monthlyRecurringRevenue.toFixed(2)}`);
  }
  if (data.availableBalance != null) {
    parts.push(`balance $${data.availableBalance.toFixed(2)} ${data.currency}`);
  }

  // Renewals within 14 days
  const urgentRenewals = (data.subscriptions ?? []).filter((s: any) => s.daysUntilRenewal <= 14);
  if (urgentRenewals.length > 0) {
    const names = urgentRenewals
      .map((s: any) => `${s.plan || s.id} in ${s.daysUntilRenewal}d`)
      .join(", ");
    parts.push(`renewals due soon: ${names}`);
  }

  // Cancellations pending
  const cancelling = (data.subscriptions ?? []).filter((s: any) => s.cancelAtPeriodEnd);
  if (cancelling.length > 0) {
    parts.push(`${cancelling.length} subscription(s) set to cancel at period end`);
  }

  return parts.join(", ");
}
