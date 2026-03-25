// Shared provider data fetchers — used by both the live API route and the background scan job
import Anthropic from "@anthropic-ai/sdk";
import { MOCK_MODE_ENABLED } from "./config";
import { getMockProvider, mockAnthropic } from "./mock-providers";

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
  // Guard: empty token means the credential field was mismatched — fail clearly
  if (!apiToken || apiToken === "undefined") {
    return {
      provider: "vercel",
      error: "No API token provided — check your Vercel integration on the Integrations page.",
      _summary: "Vercel — no token",
      _signal: "No API token found. Re-add your Vercel token on the Integrations page.",
      _status: "warn",
    };
  }

  const headers = { Authorization: `Bearer ${apiToken}` };

  // Fetch user info first — works for both hobby and team accounts
  // /v2/teams returns 403 for hobby users even with a valid token (not a credential error)
  const [userRes, projectsRes] = await Promise.all([
    fetchTimeout("https://api.vercel.com/v2/user", { headers }),
    fetchTimeout("https://api.vercel.com/v9/projects?limit=20", { headers }),
  ]);

  // A 401 on /v2/user is a real credential error — token is invalid
  if (!userRes.ok && userRes.status === 401) {
    return {
      provider: "vercel",
      error: "Invalid API token — the token was rejected by Vercel (HTTP 401).",
      _credentialError: true,
      _credentialMessage: "Vercel API token is invalid or revoked. Rotate it on the Integrations page.",
      _summary: "Vercel — invalid token",
      _signal: "API token rejected by Vercel. Create a new token in Vercel → Settings → Tokens.",
      _status: "warn",
    };
  }

  const userData = userRes.ok ? await userRes.json() : null;
  const projectsData = projectsRes.ok ? await projectsRes.json() : null;

  // Try teams endpoint separately — 403 here just means hobby plan, not a bad token
  const teamsRes = await fetchTimeout("https://api.vercel.com/v2/teams", { headers });
  const teamsData = teamsRes.ok ? await teamsRes.json() : null;
  const team = teamsData?.teams?.[0] ?? null;

  // Determine plan: team subscription > user billing plan > hobby default
  const userBillingPlan = userData?.user?.billingPeriod ?? null;
  const plan = team?.subscription?.plan ?? (userBillingPlan ? "pro" : "hobby");
  const projectCount = projectsData?.projects?.length ?? 0;
  const username = userData?.user?.username ?? userData?.user?.name ?? null;
  const hobbyOverLimit = plan === "hobby" && projectCount > 3;

  return {
    provider: "vercel",
    plan,
    teamName: team?.name ?? username,
    username,
    projectCount,
    _summary: `${plan} · ${projectCount} project${projectCount !== 1 ? "s" : ""}`,
    _signal: hobbyOverLimit
      ? "Hobby plan has limits — consider upgrading to Pro."
      : `${projectCount} project${projectCount !== 1 ? "s" : ""} on ${plan} plan.`,
    _status: hobbyOverLimit ? "upgrade" : "good",
    projects: (projectsData?.projects ?? []).slice(0, 10).map((p: any) => ({
      name: p.name,
      framework: p.framework,
      lastDeployed: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
    })),
    billingPeriodEnd: team?.subscription?.period?.end
      ? new Date(team.subscription.period.end * 1000).toISOString()
      : null,
    // Only set error if projects also failed — teams 403 alone is not an error
    error: (!userRes.ok && !projectsRes.ok) ? `HTTP ${userRes.status}` : null,
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
    return { provider: "supabase", error: `HTTP ${projectsRes.status}` };
  }
  const projects = await projectsRes.json();
  if (!projects || projects.length === 0) {
    return { provider: "supabase", projects: [], _summary: "No projects found", _signal: "Create a project to get started.", _status: "good" };
  }

  const project = projects[0];
  const usageRes = await fetchTimeout(`https://api.supabase.com/v1/projects/${project.ref}/usage`, { headers });
  const usage = usageRes.ok ? await usageRes.json() : null;

  const freeTier = project.plan.id === "free";
  const usageMetrics = (usage?.usage ?? []).map((u: any) => {
    const limit = freeTier ? SUPABASE_FREE_LIMITS[u.metric] : null;
    const pct = limit ? u.usage / limit.limit : null;
    return {
      metric: u.metric,
      name: limit?.label ?? u.metric,
      usage: u.usage,
      limit: limit?.limit ?? null,
      unit: limit?.unit ?? "",
      usageFormatted: limit?.unit === "MB" || limit?.unit === "GB" ? formatBytes(u.usage) : u.usage.toLocaleString(),
      limitFormatted: limit ? (limit.unit === "MB" || limit.unit === "GB" ? formatBytes(limit.limit) : limit.limit.toLocaleString()) : null,
      pct: pct,
    };
  });

  const highUsage = usageMetrics.find((u: any) => u.pct > 0.8);
  return {
    provider: "supabase",
    projects,
    usage: usageMetrics,
    _summary: `${project.plan.name} · ${project.name}`,
    _signal: highUsage ? `High usage on ${highUsage.name} (${(highUsage.pct*100).toFixed(0)}%) — consider upgrading.` : "Usage is within limits.",
    _status: highUsage ? "upgrade" : "good",
    error: null,
  };
}

export async function fetchGitHub(accessToken: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [userRes, reposRes] = await Promise.all([
    fetchTimeout("https://api.github.com/user", { headers }),
    fetchTimeout("https://api.github.com/user/repos?per_page=20&sort=pushed", { headers }),
  ]);

  const user = userRes.ok ? await userRes.json() : null;
  const repos = reposRes.ok ? await reposRes.json() : [];

  return {
    provider: "github",
    user: user ? { login: user.login, name: user.name, avatarUrl: user.avatar_url } : null,
    repos: repos.map((r: any) => ({ id: r.id, name: r.full_name, private: r.private, pushedAt: r.pushed_at, url: r.html_url })),
    _summary: `${user?.login ?? "Not logged in"}`,
    _signal: `${repos.length} repos found.`,
    _status: "good",
    error: !userRes.ok ? `HTTP ${userRes.status}` : null,
  };
}

export async function checkDomain(domain: string) {
  try {
    const res = await fetch(`https://api.whois.vu/?q=${domain}`);
    const data = await res.json();
    const expires = data.expires ?? null;
    return {
      domain,
      expires,
      daysUntilExpiry: expires ? daysUntil(expires) : null,
      registrar: data.registrar ?? null,
      status: data.status ?? [],
    };
  } catch (e) {
    return { domain, error: String(e) };
  }
}

export async function fetchAnthropic(apiKey: string): Promise<any> {
  if (MOCK_MODE_ENABLED) {
    return mockAnthropic;
  }
  const headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  const modelsRes = await fetchTimeout("https://api.anthropic.com/v1/models", { headers });
  if (!modelsRes.ok) {
    return {
      provider: "anthropic",
      error: modelsRes.status === 401 ? "Invalid API key" : `HTTP ${modelsRes.status}`,
      _summary: "Key invalid",
      _signal: "API key is invalid or revoked. Rotate it on the Integrations page.",
      _status: "upgrade",
    };
  }
  return {
    provider: "anthropic",
    _summary: "Key active",
    _signal: "Ready to analyze with Claude.",
    _status: "good",
  };
}

export async function fetchWithClaude(
  providerId: string,
  credentials: Record<string, string>
): Promise<any> {
  if (MOCK_MODE_ENABLED) {
    console.log(`[Eagle Eye] Using mock data for unknown provider ${providerId}`);
    return { provider: providerId, _summary: "Mocked unknown provider", _signal: "Using mock data", _status: "info" };
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const credList = Object.entries(credentials)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `You are Eagle Eye, an infrastructure monitoring tool. The user has connected "${providerId}" as an integration.\n\nTheir credentials:\n${credList}\n\nYour job:\n1. Figure out the "${providerId}" service and its REST API.\n2. Use http_get to call the appropriate endpoints (account info, plan/tier, usage, billing, health).\n3. Return a JSON object with:\n   - All raw data you fetched (plan, usage metrics, billing, health, etc.)\n   - "_summary": a short string describing the current plan/tier (e.g. "Pro · 3 projects")\n   - "_signal": one sentence describing the health/fit (e.g. "Usage is within limits." or "Approaching free tier limit.")\n   - "_status": one of "good", "warn", or "upgrade"\n\nBe concise. Only call endpoints that return useful monitoring data.`,
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

export const KNOWN_FETCHERS: Record<string, (creds: any) => Promise<any>> = {
  openai: (c: { apiKey: string }) => fetchOpenAI(c.apiKey),
  stripe: (c: { apiKey: string }) => fetchStripe(c.apiKey),
  // Vercel integrations form stores the key as 'key' — accept both field names
  vercel: (c: { key?: string; apiToken?: string }) => fetchVercel((c.key ?? c.apiToken) as string),
  resend: (c: { apiKey: string }) => fetchResend(c.apiKey),
  twilio: (c: { accountSid: string; authToken: string }) => fetchTwilio(c.accountSid, c.authToken),
  supabase: (c: { accessToken: string }) => fetchSupabase(c.accessToken),
  github: (c: { accessToken: string }) => fetchGitHub(c.accessToken),
  anthropic: (c: { apiKey: string }) => fetchAnthropic(c.apiKey),
};

export type Credentials = Record<string, Record<string, string>>;

export async function runAllProviders(credentials: Credentials, domains: string[]) {
  const tasks: Promise<any>[] = [];
  const keys: string[] = [];

  for (const [provider, creds] of Object.entries(credentials)) {
    if (provider === "domains") continue;
    const fetcher = KNOWN_FETCHERS[provider];
    if (MOCK_MODE_ENABLED) {
      const mockData = getMockProvider(provider);
      tasks.push(Promise.resolve(mockData ?? { provider, _skipped: true }));
    } else if (fetcher) {
      tasks.push(fetcher(creds));
    } else {
      // Unknown/custom provider — return a lightweight placeholder so the scan
      // doesn’t crash. The AI analysis step will still see the provider name
      // and credential shape and can surface relevant recommendations.
      tasks.push(Promise.resolve({
        provider,
        _unknown: true,
        credentialFields: Object.keys(creds),
        _summary: `${provider} — custom integration`,
        _signal: "Custom provider connected. Eagle Eye will include it in AI analysis.",
        _status: "good",
      }));
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
