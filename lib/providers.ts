// Shared provider data fetchers — used by both the live API route and the background scan job

// Wrap fetch with a timeout so slow providers never stall the whole scan
function fetchTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000);
}

export async function fetchOpenAI(apiKey: string) {
  const headers = { Authorization: `Bearer ${apiKey}` };

  // Validate key first — /v1/models is always available and lightweight
  const modelsRes = await fetchTimeout("https://api.openai.com/v1/models", { headers });
  if (!modelsRes.ok) {
    return {
      provider: "openai",
      plan: null,
      hardLimitUsd: null,
      softLimitUsd: null,
      monthlySpendUsd: null,
      accessUntil: null,
      error: modelsRes.status === 401 ? "Invalid API key" : `HTTP ${modelsRes.status}`,
      _summary: "Key invalid",
      _signal: "API key is invalid or revoked. Rotate it on the Integrations page.",
      _status: "upgrade",
    };
  }

  // Try new costs API (requires usage.read permission on the key)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startTime = Math.floor(startOfMonth.getTime() / 1000);

  const [costsRes, legacySubRes] = await Promise.all([
    fetchTimeout(`https://api.openai.com/v1/organization/costs?start_time=${startTime}&bucket_width=1d&limit=31`, { headers }),
    fetchTimeout("https://api.openai.com/v1/dashboard/billing/subscription", { headers }),
  ]);

  let monthlySpendUsd: number | null = null;
  let hardLimitUsd: number | null = null;
  let plan = "pay-as-you-go";

  if (costsRes.ok) {
    const costsData = await costsRes.json();
    const total = (costsData.data ?? []).reduce((sum: number, bucket: any) =>
      sum + (bucket.results ?? []).reduce((s: number, r: any) => s + (r.amount?.value ?? 0), 0), 0);
    monthlySpendUsd = parseFloat(total.toFixed(4));
  }

  if (legacySubRes.ok) {
    const sub = await legacySubRes.json();
    plan = sub?.plan?.id ?? plan;
    hardLimitUsd = sub?.hard_limit_usd ?? null;
  }

  const pct = monthlySpendUsd != null && hardLimitUsd ? monthlySpendUsd / hardLimitUsd : null;
  return {
    provider: "openai",
    plan,
    hardLimitUsd,
    softLimitUsd: null,
    monthlySpendUsd,
    accessUntil: null,
    error: null,
    _summary: monthlySpendUsd != null ? `${plan} · $${monthlySpendUsd.toFixed(2)}/mo` : `${plan} · key active`,
    _signal: monthlySpendUsd != null
      ? (pct != null && pct > 0.8 ? `At ${(pct*100).toFixed(0)}% of hard limit — consider raising it.` : `$${monthlySpendUsd.toFixed(2)} spent this month.`)
      : "Key is valid. Add usage.read permission to your API key to see spend data.",
    _status: pct != null && pct > 0.8 ? "upgrade" : pct != null && pct > 0.5 ? "warn" : "good",
  };
}

export async function fetchStripe(apiKey: string) {
  const auth = "Basic " + Buffer.from(apiKey + ":").toString("base64");
  const headers = { Authorization: auth };

  const [balanceRes, subsRes] = await Promise.all([
    fetchTimeout("https://api.stripe.com/v1/balance", { headers }),
    fetchTimeout("https://api.stripe.com/v1/subscriptions?limit=20&status=active", { headers }),
  ]);

  const balance = balanceRes.ok ? await balanceRes.json() : null;
  const subs = subsRes.ok ? await subsRes.json() : null;
  const activeSubs = subs?.data ?? [];

  const monthlyRecurring = activeSubs.reduce((sum: number, s: any) => {
    const price = s.items?.data?.[0]?.price;
    if (!price) return sum;
    const amount = price.unit_amount / 100;
    return sum + (price.recurring?.interval === "year" ? amount / 12 : amount);
  }, 0);

  const avail = balance?.available?.[0] ? balance.available[0].amount / 100 : null;
  return {
    provider: "stripe",
    availableBalance: avail,
    currency: balance?.available?.[0]?.currency?.toUpperCase() ?? "USD",
    activeSubscriptions: activeSubs.length,
    monthlyRecurringRevenue: monthlyRecurring,
    _summary: `${activeSubs.length} active sub${activeSubs.length !== 1 ? "s" : ""} · MRR $${monthlyRecurring.toFixed(2)}`,
    _signal: `Available balance: $${avail?.toFixed(2) ?? "—"}.`,
    _status: "good",
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

export async function fetchVercel(apiToken: string) {
  const headers = { Authorization: `Bearer ${apiToken}` };

  const [teamsRes, projectsRes] = await Promise.all([
    fetchTimeout("https://api.vercel.com/v2/teams", { headers }),
    fetchTimeout("https://api.vercel.com/v9/projects?limit=20", { headers }),
  ]);

  const teamsData = teamsRes.ok ? await teamsRes.json() : null;
  const projectsData = projectsRes.ok ? await projectsRes.json() : null;
  const team = teamsData?.teams?.[0] ?? null;

  const plan = team?.subscription?.plan ?? "hobby";
  const projectCount = projectsData?.projects?.length ?? 0;
  const hobbyOverLimit = plan === "hobby" && projectCount > 3;
  return {
    provider: "vercel",
    plan,
    teamName: team?.name ?? null,
    projectCount,
    _summary: `${plan} · ${projectCount} project${projectCount !== 1 ? "s" : ""}`,
    _signal: hobbyOverLimit ? "Hobby plan has limits — consider upgrading to Pro." : "Plan looks appropriate for current usage.",
    _status: hobbyOverLimit ? "upgrade" : "good",
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

export async function fetchResend(apiKey: string) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const domainsRes = await fetchTimeout("https://api.resend.com/domains", { headers });
  const domainsData = domainsRes.ok ? await domainsRes.json() : null;

  const domains = (domainsData?.data ?? []).map((d: any) => ({ name: d.name, status: d.status, region: d.region, createdAt: d.created_at }));
  const verified = domains.filter((d: any) => d.status === "verified").length;
  const domainCount = domains.length;
  return {
    provider: "resend",
    domains,
    domainCount,
    error: !domainsRes.ok ? `HTTP ${domainsRes.status}` : null,
    _summary: `${domainCount} domain${domainCount !== 1 ? "s" : ""} · ${verified} verified`,
    _signal: verified === 0 && domainCount > 0 ? "No verified domains — verify to avoid deliverability issues." : domainCount === 0 ? "No domains added yet." : `${verified} domain${verified !== 1 ? "s" : ""} verified and ready to send.`,
    _status: verified === 0 && domainCount > 0 ? "warn" : "good",
  };
}

export async function fetchTwilio(accountSid: string, authToken: string) {
  const auth = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const headers = { Authorization: auth };

  const [accountRes, numbersRes] = await Promise.all([
    fetchTimeout(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, { headers }),
    fetchTimeout(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=20`, { headers }),
  ]);

  const account = accountRes.ok ? await accountRes.json() : null;
  const numbers = numbersRes.ok ? await numbersRes.json() : null;

  const bal = parseFloat(account?.balance ?? "99");
  const phoneCount = numbers?.incoming_phone_numbers?.length ?? 0;
  return {
    provider: "twilio",
    accountStatus: account?.status ?? null,
    friendlyName: account?.friendly_name ?? null,
    type: account?.type ?? null,
    balance: account?.balance ?? null,
    phoneNumbers: (numbers?.incoming_phone_numbers ?? []).map((n: any) => ({ friendlyName: n.friendly_name, phoneNumber: n.phone_number, capabilities: n.capabilities })),
    phoneNumberCount: phoneCount,
    error: !accountRes.ok ? `HTTP ${accountRes.status}` : null,
    _summary: `${account?.type ?? "Pay-as-you-go"} · ${phoneCount} number${phoneCount !== 1 ? "s" : ""}`,
    _signal: bal < 5 ? `Balance $${bal.toFixed(2)} — low, top up to avoid interruption.` : `Balance $${bal.toFixed(2)} — looks healthy.`,
    _status: bal < 5 ? "warn" : "good",
  };
}

// Free-tier limits for Supabase (as of 2026)
const SUPABASE_FREE_LIMITS: Record<string, { label: string; limit: number; unit: string }> = {
  db_size:                     { label: "Database size",          limit: 500 * 1024 * 1024,    unit: "MB" },
  egress:                      { label: "Bandwidth",              limit: 5 * 1024 * 1024 * 1024, unit: "GB" },
  storage_size:                { label: "Storage",                limit: 1024 * 1024 * 1024,   unit: "GB" },
  monthly_active_users:        { label: "MAU",                    limit: 50_000,               unit: "" },
  monthly_active_sso_users:    { label: "SSO MAU",                limit: 50,                   unit: "" },
  func_invocations:            { label: "Edge fn invocations",    limit: 500_000,              unit: "" },
  realtime_peak_connections:   { label: "Realtime connections",   limit: 200,                  unit: "" },
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export async function fetchSupabase(accessToken: string) {
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const projectsRes = await fetchTimeout("https://api.supabase.com/v1/projects", { headers });
  if (!projectsRes.ok) {
    return {
      provider: "supabase",
      projectCount: 0,
      projects: [],
      plan: "free",
      usage: null,
      error: `HTTP ${projectsRes.status}`,
      _summary: "Auth failed",
      _signal: "Access token is invalid or lacks project read permissions.",
      _status: "upgrade",
    };
  }

  const raw = await projectsRes.json();
  const list: any[] = Array.isArray(raw) ? raw : [];
  const mapped = list.map((p: any) => ({
    name: p.name,
    ref: p.id,
    plan: p.subscription_tier ?? p.plan ?? "free",
    region: p.region,
    status: p.status,
  }));

  // Fetch usage for each project in parallel
  const usageResults = await Promise.allSettled(
    mapped.map(async (p) => {
      const res = await fetchTimeout(`https://api.supabase.com/v1/projects/${p.ref}/usage`, { headers });
      if (!res.ok) return null;
      return { ref: p.ref, name: p.name, plan: p.plan, data: await res.json() };
    })
  );

  // Parse usage metrics; API returns { usages: [{metric, usage, limit, cost, ...}] }
  const projectUsage: Record<string, any> = {};
  const signals: string[] = [];
  let worstStatus: "good" | "warn" | "upgrade" = "good";

  for (const r of usageResults) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { ref, name, plan, data } = r.value;
    const usages: any[] = data?.usages ?? [];
    const metrics: Record<string, { usage: number; limit: number | null; pct: number | null; label: string; formatted: string }> = {};

    for (const u of usages) {
      const meta = SUPABASE_FREE_LIMITS[u.metric];
      const usage = u.usage ?? 0;
      const limitVal = u.limit ?? meta?.limit ?? null;
      const pct = limitVal ? usage / limitVal : null;
      const isByteMetric = ["db_size", "egress", "storage_size"].includes(u.metric);
      metrics[u.metric] = {
        usage,
        limit: limitVal,
        pct,
        label: meta?.label ?? u.metric,
        formatted: isByteMetric ? formatBytes(usage) : String(usage),
      };

      // Signal generation
      if (pct !== null && plan === "free") {
        if (pct >= 0.9) {
          signals.push(`${name}: ${meta?.label ?? u.metric} at ${(pct * 100).toFixed(0)}% of free limit — upgrade now.`);
          worstStatus = "upgrade";
        } else if (pct >= 0.7) {
          signals.push(`${name}: ${meta?.label ?? u.metric} at ${(pct * 100).toFixed(0)}% of free limit.`);
          if (worstStatus === "good") worstStatus = "warn";
        }
      }
    }
    projectUsage[ref] = metrics;
  }

  const freeCount = mapped.filter((p) => p.plan === "free").length;
  const firstPlan = mapped[0]?.plan ?? "free";

  return {
    provider: "supabase",
    projectCount: list.length,
    projects: mapped.map((p) => ({ ...p, usage: projectUsage[p.ref] ?? null })),
    plan: firstPlan,
    usage: projectUsage,
    error: null,
    _summary: `${list.length} project${list.length !== 1 ? "s" : ""} · ${firstPlan} plan`,
    _signal: signals.length > 0
      ? signals.join(" ")
      : freeCount >= 2
        ? `${freeCount} projects on free tier — free plan allows 2 active projects.`
        : list.length === 0
          ? "No projects found."
          : `${mapped.map((p) => `${p.name} (${p.plan})`).join(", ")} — usage within limits.`,
    _status: worstStatus !== "good" ? worstStatus : freeCount >= 2 ? "warn" : "good",
  };
}

export async function fetchAnthropic(apiKey: string) {
  // Use the models endpoint — lightweight, no token spend
  const res = await fetchTimeout("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  return {
    provider: "anthropic",
    keyValid: res.ok,
    status: res.ok ? "active" : res.status === 401 ? "invalid" : "unknown",
    error: res.status === 401 ? "Invalid API key" : !res.ok ? `HTTP ${res.status}` : null,
    _summary: `API key ${res.ok ? "active" : "invalid"}`,
    _signal: res.ok ? "Key is valid. No billing API — track expiry on Key Hygiene page." : "API key is invalid. Rotate it on the Integrations page.",
    _status: res.ok ? "good" : "upgrade",
  };
}

export async function checkDomain(domain: string) {
  try {
    const res = await fetchTimeout(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/json" },
    }, 10000);
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

// Credentials is a plain map of provider → credential fields.
// Known providers have typed fields; unknown providers are passed through as-is.
export type Credentials = Record<string, Record<string, string>>;

// Providers with hand-written fetchers — everything else goes to Claude.
const KNOWN_FETCHERS: Record<string, (creds: Record<string, string>) => Promise<any>> = {
  openai:    (c) => fetchOpenAI(c.key),
  anthropic: (c) => fetchAnthropic(c.key),
  supabase:  (c) => fetchSupabase(c.accessToken),
  stripe:    (c) => fetchStripe(c.key),
  vercel:    (c) => fetchVercel(c.key),
  resend:    (c) => fetchResend(c.key),
  twilio:    (c) => fetchTwilio(c.accountSid, c.authToken),
};

// ── Agentic fetcher for unknown providers ──────────────────────────────────
// Claude is given an http_get tool and told to research the provider's API,
// fetch whatever is useful (plan, usage, health, billing), and return JSON.

export async function fetchWithClaude(
  providerId: string,
  credentials: Record<string, string>
): Promise<any> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const credList = Object.entries(credentials)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `You are Eagle Eye, an infrastructure monitoring tool. The user has connected "${providerId}" as an integration.

Their credentials:
${credList}

Your job:
1. Figure out the "${providerId}" service and its REST API.
2. Use http_get to call the appropriate endpoints (account info, plan/tier, usage, billing, health).
3. Return a JSON object with:
   - All raw data you fetched (plan, usage metrics, billing, health, etc.)
   - "_summary": a short string describing the current plan/tier (e.g. "Pro · 3 projects")
   - "_signal": one sentence describing the health/fit (e.g. "Usage is within limits." or "Approaching free tier limit.")
   - "_status": one of "good", "warn", or "upgrade"

Be concise. Only call endpoints that return useful monitoring data.`,
  }];

  const tools: Anthropic.Tool[] = [{
    name: "http_get",
    description: "Make an HTTP GET request to any API endpoint",
    input_schema: {
      type: "object" as const,
      properties: {
        url:     { type: "string", description: "Full URL to fetch" },
        headers: { type: "object", description: "HTTP headers (e.g. Authorization)", additionalProperties: { type: "string" } },
      },
      required: ["url"],
    },
  }];

  let response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    tools,
    messages,
  });

  // Agentic loop — let Claude call the provider APIs
  const MAX_TURNS = 8;
  let turns = 0;
  while (response.stop_reason === "tool_use" && turns < MAX_TURNS) {
    turns++;
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (tool) => {
        const { url, headers = {} } = tool.input as { url: string; headers?: Record<string, string> };
        try {
          const res = await fetch(url, { headers });
          const text = await res.text();
          return {
            type: "tool_result" as const,
            tool_use_id: tool.id,
            content: res.ok ? text.slice(0, 8000) : `HTTP ${res.status}: ${text.slice(0, 500)}`,
          };
        } catch (e) {
          return { type: "tool_result" as const, tool_use_id: tool.id, content: `Fetch error: ${String(e)}` };
        }
      })
    );

    messages.push({ role: "user", content: results });
    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      tools,
      messages,
    });
  }

  // Extract and parse Claude's final JSON summary
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const text = textBlock?.text ?? "";
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ?? text.match(/(\{[\s\S]*\})/);
    return jsonMatch ? JSON.parse(jsonMatch[1]) : { provider: providerId, summary: text, _agentFetched: true };
  } catch {
    return { provider: providerId, summary: text, _agentFetched: true };
  }
}

export async function runAllProviders(credentials: Credentials, domains: string[]) {
  const tasks: Promise<any>[] = [];
  const keys: string[] = [];

  for (const [provider, creds] of Object.entries(credentials)) {
    if (provider === "domains") continue;
    const fetcher = KNOWN_FETCHERS[provider];
    if (fetcher) {
      tasks.push(fetcher(creds));
    } else {
      // Unknown provider — let Claude figure it out
      tasks.push(fetchWithClaude(provider, creds));
    }
    keys.push(provider);
  }

  const [providerResults, domainResults] = await Promise.all([
    Promise.allSettled(tasks),
    Promise.all(domains.map(checkDomain)),
  ]);

  const providers: Record<string, any> = {};
  providerResults.forEach((result, i) => {
    providers[keys[i]] = result.status === "fulfilled" ? result.value : { error: String(result.reason) };
  });

  return { providers, domains: domainResults };
}
