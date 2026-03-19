import { NextRequest, NextResponse } from "next/server";

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000);
}

// ── Provider fetchers ──────────────────────────────────────────────────────

async function fetchOpenAI(apiKey: string) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const today = new Date();
  const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [subRes, usageRes] = await Promise.all([
    fetch("https://api.openai.com/v1/dashboard/billing/subscription", { headers }),
    fetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${start}&end_date=${end}`, { headers }),
  ]);

  const sub = subRes.ok ? await subRes.json() : null;
  const usage = usageRes.ok ? await usageRes.json() : null;

  return {
    provider: "openai",
    plan: sub?.plan?.id ?? "pay-as-you-go",
    hardLimitUsd: sub?.hard_limit_usd ?? null,
    softLimitUsd: sub?.soft_limit_usd ?? null,
    monthlySpendUsd: usage?.total_usage ? usage.total_usage / 100 : null,
    accessUntil: sub?.access_until ? new Date(sub.access_until * 1000).toISOString() : null,
    tokensGranted: sub?.system_hard_limit_usd ?? null,
    error: !subRes.ok ? `HTTP ${subRes.status}` : null,
  };
}

async function fetchStripe(apiKey: string) {
  const auth = "Basic " + Buffer.from(apiKey + ":").toString("base64");
  const headers = { Authorization: auth };

  const [balanceRes, subsRes, pricesRes] = await Promise.all([
    fetch("https://api.stripe.com/v1/balance", { headers }),
    fetch("https://api.stripe.com/v1/subscriptions?limit=20&status=active", { headers }),
    fetch("https://api.stripe.com/v1/prices?limit=20&active=true", { headers }),
  ]);

  const balance = balanceRes.ok ? await balanceRes.json() : null;
  const subs = subsRes.ok ? await subsRes.json() : null;
  const prices = pricesRes.ok ? await pricesRes.json() : null;

  const activeSubs = subs?.data ?? [];
  const monthlyRecurring = activeSubs.reduce((sum: number, s: any) => {
    const price = s.items?.data?.[0]?.price;
    if (!price) return sum;
    const amount = price.unit_amount / 100;
    if (price.recurring?.interval === "year") return sum + amount / 12;
    return sum + amount;
  }, 0);

  return {
    provider: "stripe",
    availableBalance: balance?.available?.[0] ? balance.available[0].amount / 100 : null,
    currency: balance?.available?.[0]?.currency?.toUpperCase() ?? "USD",
    activeSubscriptions: activeSubs.length,
    monthlyRecurringRevenue: monthlyRecurring,
    subscriptions: activeSubs.map((s: any) => ({
      id: s.id,
      status: s.status,
      plan: s.items?.data?.[0]?.price?.nickname ?? s.items?.data?.[0]?.price?.id,
      amountUsd: (s.items?.data?.[0]?.price?.unit_amount ?? 0) / 100,
      interval: s.items?.data?.[0]?.price?.recurring?.interval,
      currentPeriodEnd: new Date(s.current_period_end * 1000).toISOString(),
      daysUntilRenewal: daysUntil(new Date(s.current_period_end * 1000).toISOString()),
      cancelAtPeriodEnd: s.cancel_at_period_end,
    })),
    error: !balanceRes.ok ? `HTTP ${balanceRes.status}` : null,
  };
}

async function fetchVercel(apiToken: string) {
  const headers = { Authorization: `Bearer ${apiToken}` };

  const [teamsRes, projectsRes] = await Promise.all([
    fetch("https://api.vercel.com/v2/teams", { headers }),
    fetch("https://api.vercel.com/v9/projects?limit=20", { headers }),
  ]);

  const teamsData = teamsRes.ok ? await teamsRes.json() : null;
  const projectsData = projectsRes.ok ? await projectsRes.json() : null;

  const team = teamsData?.teams?.[0] ?? null;

  return {
    provider: "vercel",
    plan: team?.subscription?.plan ?? "hobby",
    teamName: team?.name ?? null,
    projectCount: projectsData?.projects?.length ?? null,
    projects: (projectsData?.projects ?? []).slice(0, 10).map((p: any) => ({
      name: p.name,
      framework: p.framework,
      lastDeployed: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
    })),
    billingPeriodEnd: team?.subscription?.period?.end
      ? new Date(team.subscription.period.end * 1000).toISOString()
      : null,
    error: !teamsRes.ok ? `HTTP ${teamsRes.status}` : null,
  };
}

async function fetchResend(apiKey: string) {
  const headers = { Authorization: `Bearer ${apiKey}` };

  const domainsRes = await fetch("https://api.resend.com/domains", { headers });
  const domainsData = domainsRes.ok ? await domainsRes.json() : null;

  return {
    provider: "resend",
    domains: (domainsData?.data ?? []).map((d: any) => ({
      name: d.name,
      status: d.status,
      region: d.region,
      createdAt: d.created_at,
    })),
    domainCount: domainsData?.data?.length ?? 0,
    error: !domainsRes.ok ? `HTTP ${domainsRes.status}` : null,
  };
}

async function fetchTwilio(accountSid: string, authToken: string) {
  const auth = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const headers = { Authorization: auth };

  const [accountRes, numbersRes] = await Promise.all([
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, { headers }),
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=20`, { headers }),
  ]);

  const account = accountRes.ok ? await accountRes.json() : null;
  const numbers = numbersRes.ok ? await numbersRes.json() : null;

  return {
    provider: "twilio",
    accountStatus: account?.status ?? null,
    friendlyName: account?.friendly_name ?? null,
    type: account?.type ?? null,
    phoneNumbers: (numbers?.incoming_phone_numbers ?? []).map((n: any) => ({
      friendlyName: n.friendly_name,
      phoneNumber: n.phone_number,
      capabilities: n.capabilities,
      monthlyRenewDate: n.next_renewal_date ?? null,
    })),
    phoneNumberCount: numbers?.incoming_phone_numbers?.length ?? 0,
    error: !accountRes.ok ? `HTTP ${accountRes.status}` : null,
  };
}

async function checkDomain(domain: string) {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { domain, error: `HTTP ${res.status}`, expiresAt: null, daysLeft: null };

    const data = await res.json();
    const expiryEvent = (data.events ?? []).find((e: any) => e.eventAction === "expiration");
    const registrationEvent = (data.events ?? []).find((e: any) => e.eventAction === "registration");

    const expiresAt = expiryEvent?.eventDate ?? null;
    return {
      domain,
      expiresAt,
      daysLeft: expiresAt ? daysUntil(expiresAt) : null,
      registeredAt: registrationEvent?.eventDate ?? null,
      status: data.status ?? [],
      nameservers: (data.nameservers ?? []).map((n: any) => n.ldhName),
      error: null,
    };
  } catch {
    return { domain, error: "RDAP lookup failed", expiresAt: null, daysLeft: null };
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { credentials } = await req.json();

  const tasks: Promise<any>[] = [];
  const keys: string[] = [];

  if (credentials.openai?.key) {
    tasks.push(fetchOpenAI(credentials.openai.key));
    keys.push("openai");
  }
  if (credentials.stripe?.key) {
    tasks.push(fetchStripe(credentials.stripe.key));
    keys.push("stripe");
  }
  if (credentials.vercel?.key) {
    tasks.push(fetchVercel(credentials.vercel.key));
    keys.push("vercel");
  }
  if (credentials.resend?.key) {
    tasks.push(fetchResend(credentials.resend.key));
    keys.push("resend");
  }
  if (credentials.twilio?.accountSid && credentials.twilio?.authToken) {
    tasks.push(fetchTwilio(credentials.twilio.accountSid, credentials.twilio.authToken));
    keys.push("twilio");
  }

  const domainTasks = (credentials.domains ?? []).map((d: string) => checkDomain(d));

  const [providerResults, domainResults] = await Promise.all([
    Promise.allSettled(tasks),
    Promise.all(domainTasks),
  ]);

  const providers: Record<string, any> = {};
  providerResults.forEach((result, i) => {
    providers[keys[i]] = result.status === "fulfilled" ? result.value : { error: String(result.reason) };
  });

  return NextResponse.json({ providers, domains: domainResults });
}
