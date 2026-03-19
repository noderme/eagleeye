export function summarizeOpenAI(data: any, history: any[]): string {
  if (!data || data.error) return "";

  const spent = data.monthlySpendUsd ?? 0;
  const limit = data.hardLimitUsd ?? null;
  const pct = limit ? Math.round((spent / limit) * 100) : null;

  // Week-over-week spend trend from historical scans
  const prevSpends = history
    .map(h => h.provider_data?.openai?.monthlySpendUsd)
    .filter((v): v is number => v != null);

  let trendStr = "";
  if (prevSpends.length >= 1) {
    const prev = prevSpends[0];
    if (prev > 0) {
      const wow = Math.round(((spent - prev) / prev) * 100);
      trendStr = `, ${wow >= 0 ? "+" : ""}${wow}% vs previous scan`;
      // Projection: days to hit limit
      if (limit && spent > prev && prevSpends.length >= 1) {
        const dailyBurn = (spent - prev) / 7; // rough weekly delta → daily
        if (dailyBurn > 0) {
          const daysToLimit = Math.floor((limit - spent) / dailyBurn);
          if (daysToLimit < 30) trendStr += `, projected to hit limit in ~${daysToLimit} days`;
        }
      }
    }
  }

  const parts = [`OpenAI: $${spent.toFixed(2)} spent this billing cycle`];
  if (limit) parts.push(`$${limit} hard limit (${pct}% used)`);
  if (data.softLimitUsd) parts.push(`soft limit $${data.softLimitUsd}`);
  if (data.accessUntil) {
    const days = Math.ceil((new Date(data.accessUntil).getTime() - Date.now()) / 86400000);
    if (days < 90) parts.push(`access expires in ${days} days`);
  }
  parts.push(`plan: ${data.plan}`);
  if (trendStr) parts.push(trendStr.slice(2)); // trim leading ", "

  return parts.join(", ");
}
