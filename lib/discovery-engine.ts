/**
 * Eagle Eye — Dynamic Discovery Engine
 *
 * Given a service name + user credentials, this engine:
 * 1. Uses an LLM agent to find and read the service's API documentation
 * 2. Identifies all monitoring-relevant endpoints (usage, billing, health, limits, quotas)
 * 3. Verifies each endpoint with a real HTTP call using the user's credentials
 * 4. Returns a verified endpoint map + fetched live data
 *
 * The endpoint map is cached in the DB so discovery only runs once per service.
 * All future scans reuse the cached map — no LLM cost on repeat scans.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMKey } from "./analyze";
import { fetchApiDocs } from "./doc-fetcher";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Structured grouped summary produced by the LLM after fetching all endpoint data.
 * Each group contains only the useful extracted information — no raw JSON.
 */
export interface ProviderSummary {
  serviceId: string;
  serviceName: string;
  status: "good" | "warn" | "critical" | "credential_error";
  credentialError?: string;   // Set when API key is invalid/expired
  groups: ProviderSummaryGroup[];
  lastUpdated: string;        // ISO timestamp
}

export interface ProviderSummaryGroup {
  category: "health" | "usage" | "billing" | "limits" | "warnings" | "info";
  label: string;              // Human-readable label e.g. "Health", "API Usage"
  items: ProviderSummaryItem[];
}

export interface ProviderSummaryItem {
  key: string;                // e.g. "Monthly spend", "Storage used"
  value: string;              // e.g. "$24.50", "78%", "Online"
  alert?: "warn" | "critical"; // Optional alert level for this specific item
}

/**
 * A complete, open-ended call specification for one API endpoint.
 *
 * The LLM reads the docs and produces whatever this API actually needs:
 * any headers, any query params, any body shape, any auth scheme.
 * We store it verbatim and execute it generically — no per-service code anywhere.
 *
 * All string values (in headers, params, body) may contain {placeholder} tokens
 * that are resolved at call time from the user’s credentials or from IDs
 * extracted from earlier responses in the same scan.
 */
export interface DiscoveredEndpoint {
  // ── Identity ──────────────────────────────────────────────────────────────────────────────────
  url: string;         // Full URL with {placeholder} tokens, e.g. https://api.x.com/v1/orgs/{org_id}/usage
  method: string;      // HTTP method: GET, POST, PUT, PATCH, DELETE
  description: string; // What this endpoint returns / what it’s useful for
  category: string;    // usage | billing | health | limits | account | info | any other label

  // ── Complete call spec (LLM fills this from docs) ─────────────────────────────────────────────
  /**
   * ALL request headers. Values may contain {placeholders}.
   * The LLM includes every header the API requires: auth, content-type, versioning, etc.
   * e.g. { "Authorization": "Bearer {key}", "X-API-Version": "2024-01", "Stripe-Version": "2023-10-16" }
   */
  headers: Record<string, string>;

  /**
   * Query parameters to append to the URL. Values may contain {placeholders}.
   * The LLM includes every param the API requires or recommends for useful output.
   * e.g. { "start_time": "{month_start_unix}", "granularity": "day", "limit": "100", "expand[]": "data.balance_transaction" }
   */
  queryParams?: Record<string, string>;

  /**
   * Request body for POST/PUT/PATCH. Values may contain {placeholders}.
   * e.g. { "query": "{ viewer { login } }", "variables": {} }
   */
  body?: Record<string, any>;

  /**
   * Any additional call-level config the LLM wants to express.
   * Open-ended — the executor iterates over known keys and ignores unknown ones.
   * e.g. { "timeout": 15000, "followRedirects": false, "responseType": "text" }
   */
  callConfig?: Record<string, any>;

  /**
   * Dependency chain: list of URLs (with {placeholders}) that must be called
   * before this endpoint, in order, to resolve IDs this endpoint needs.
   * e.g. ["https://api.x.com/v1/orgs"] → extracts org_id → used in this endpoint’s URL
   */
  dependsOn?: string[];

  /**
   * How to extract values from THIS endpoint’s response for use in later calls.
   * path uses dot-notation + array index: "orgs[0].id", "data.subscription.id"
   * e.g. [{ path: "teams[0].id", storeAs: "team_id" }, { path: "user.id", storeAs: "user_id" }]
   */
  extractFrom?: Array<{ path: string; storeAs: string }>;

  /**
   * Dot-notation path to the expiry timestamp in this endpoint's response.
   * Set by the LLM when it finds a token/key metadata endpoint with expiry data.
   * e.g. "token.expires_at", "data.expiry", "expires_at"
   * null = LLM confirmed this endpoint has no expiry field (do not ask user)
   * undefined = unknown (may ask user as fallback)
   */
  expiryField?: string | null;
  // ── Runtime state (set by verifyAndFetch, not by LLM) ────────────────────────────────────────────
  /** @deprecated kept for backward compat with v1/v2 cached maps that used a single authHeader string */
  authHeader?: string;
  verified: boolean;
  lastStatus?: number;
  lastResponseSnippet?: string;
}

export interface EndpointMap {
  serviceId: string;
  serviceName: string;
  apiBaseUrl: string;
  endpoints: DiscoveredEndpoint[];
  discoveredAt: string;
  discoveryVersion: number;
  /** URL where documentation was sourced from (for transparency + debugging) */
  docsUrl?: string;
  /** Whether docs were found via live web search (true) or LLM memory fallback (false) */
  docsFromSearch?: boolean;
  /**
   * Auto-detected key expiry timestamp (ISO string) from the service's token metadata endpoint.
   * Set by verifyAndFetch when it finds and extracts an expiry field from a response.
   * null = service was checked and has no expiry concept (do not show manual prompt)
   * undefined = not yet checked
   */
  keyExpiresAt?: string | null;
  /**
   * Whether the discovery engine found and checked for expiry in the docs.
   * true = LLM explicitly found or confirmed absence of expiry fields
   * false/undefined = not yet determined
   */
  expiryChecked?: boolean;
}

export interface LiveProviderData {
  serviceId: string;
  serviceName: string;
  endpoints: Array<{
    url: string;
    description: string;
    category: string;
    status: number;
    ok: boolean;
    data: any;
    error?: string;
    credentialError?: boolean; // 401/403 — key is invalid/expired
  }>;
  // Aggregated signals for the analysis LLM
  _summary: string;
  _signal: string;
  _status: "good" | "warn" | "critical" | "credential_error";
  _credentialError?: string;    // Human-readable credential failure message
  _rawBodies: Record<string, string>; // Full raw response bodies for LLM analysis
}

// ── LLM caller (multi-provider) ──────────────────────────────────────────────

async function callLLMWithTools(
  systemPrompt: string,
  userMessage: string,
  tools: any[],
  llmKey: LLMKey,
  onToolCall: (name: string, input: any) => Promise<string>,
  maxTurns = 10
): Promise<string> {
  if (llmKey.provider === "anthropic") {
    const client = new Anthropic({ apiKey: llmKey.apiKey, timeout: 120_000 });
    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    let messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
    let turns = 0;

    while (turns < maxTurns) {
      turns++;
      const response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        system: systemPrompt,
        tools: anthropicTools,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        return textBlock?.text ?? "";
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tool) => ({
          type: "tool_result" as const,
          tool_use_id: tool.id,
          content: await onToolCall(tool.name, tool.input),
        }))
      );
      messages.push({ role: "user", content: results });
    }
    return "Max turns reached";
  }

  if (llmKey.provider === "openai") {
    const client = new OpenAI({ apiKey: llmKey.apiKey, timeout: 120_000 });
    const openaiTools = tools.map(t => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

    let messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
    let turns = 0;

    while (turns < maxTurns) {
      turns++;
      const response = await client.chat.completions.create({ model: "gpt-4o", tools: openaiTools, messages });
      const msg = response.choices[0].message;
      messages.push(msg);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return msg.content ?? "";
      }

      for (const call of msg.tool_calls) {
        const fn = (call as any).function as { name: string; arguments: string };
        const result = await onToolCall(fn.name, JSON.parse(fn.arguments));
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
    return "Max turns reached";
  }

  // Gemini — no tool use support in this flow, use text-only
  try {
    const genAI = new GoogleGenerativeAI(llmKey.apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(`${systemPrompt}\n\n${userMessage}`);
    return result.response.text();
  } catch (e) {
    const msg = String(e);
    if (/API_KEY_INVALID|API key not valid|invalid.*key/i.test(msg)) {
      throw new Error("Invalid Gemini API key — please update it in Integrations.");
    }
    if (/RESOURCE_EXHAUSTED|quota|429/i.test(msg)) {
      throw new Error("Gemini quota exceeded — free tier is full or rate limited.");
    }
    throw new Error(`Gemini error: ${msg.replace(/\[GoogleGenerativeAI Error\]:\s*/i, "").replace(/Error fetching from https?:\/\/[^\s]+:\s*/i, "").slice(0, 120)}`);
  }
}

// ── HTTP fetch with timeout ──────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Credential error detection ───────────────────────────────────────────────

function isCredentialError(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  // Soft credential errors inside 200 responses
  const lower = body.toLowerCase();
  return (
    lower.includes("invalid_api_key") ||
    lower.includes("invalid api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication failed") ||
    lower.includes("api key not found") ||
    lower.includes("invalid token") ||
    lower.includes("token expired") ||
    lower.includes("access denied")
  );
}

function isQuotaError(status: number, body: string): boolean {
  if (status === 429) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("quota_exceeded") ||
    lower.includes("rate_limit") ||
    lower.includes("limit reached") ||
    lower.includes("quota reached") ||
    lower.includes("usage limit") ||
    lower.includes("billing_hard_limit_reached")
  );
}

// ── Resolve credential placeholders ─────────────────────────────────────────

/**
 * Resolve all {placeholder} tokens in a string using the resolved ID store.
 * Handles both {key} and {KEY} (case-insensitive match).
 */
function resolvePlaceholders(template: string, store: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(store)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
    result = result.replace(new RegExp(`\\{${key.toUpperCase()}\\}`, "g"), String(value));
  }
  return result;
}

/**
 * Recursively resolve all {placeholder} tokens in any value —
 * works on strings, arrays, and nested objects.
 */
function resolveDeep(val: any, store: Record<string, string>): any {
  if (typeof val === "string") return resolvePlaceholders(val, store);
  if (Array.isArray(val)) return val.map(v => resolveDeep(v, store));
  if (val && typeof val === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) out[k] = resolveDeep(v, store);
    return out;
  }
  return val;
}

/**
 * Build resolved headers for a call.
 * Supports both the new `headers` map and the legacy `authHeader` string.
 */
function buildHeaders(endpoint: DiscoveredEndpoint, store: Record<string, string>): Record<string, string> {
  // New format: headers is a map
  if (endpoint.headers && Object.keys(endpoint.headers).length > 0) {
    return resolveDeep(endpoint.headers, store) as Record<string, string>;
  }
  // Legacy format: single authHeader string like "Authorization: Bearer {api_key}"
  if (endpoint.authHeader) {
    const resolved = resolvePlaceholders(endpoint.authHeader, store);
    const colonIdx = resolved.indexOf(":");
    if (colonIdx === -1) return { Authorization: resolved };
    return { [resolved.slice(0, colonIdx).trim()]: resolved.slice(colonIdx + 1).trim() };
  }
  return {};
}

/**
 * Append resolved query params to a URL string.
 */
function appendQueryParams(url: string, params: Record<string, string> | undefined, store: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return url;
  const resolved = resolveDeep(params, store) as Record<string, string>;
  const qs = Object.entries(resolved)
    .filter(([, v]) => v !== undefined && v !== null && !String(v).includes("{"))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  if (!qs) return url;
  return url.includes("?") ? `${url}&${qs}` : `${url}?${qs}`;
}

/**
 * Extract a value from a response object using dot-notation + array index path.
 * e.g. "teams[0].id" or "data.subscription.plan"
 */
function extractByPath(obj: any, path: string): string | undefined {
  const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur != null ? String(cur) : undefined;
}

// ── Phase 1: Discover endpoints via live documentation fetch + LLM ───────────

/**
 * Discovers API endpoints by:
 * 1. Fetching REAL documentation from the web (not LLM training memory)
 * 2. Passing the actual doc text to the LLM for analysis
 * 3. LLM extracts endpoint patterns from what it actually read
 * 4. Returns an EndpointMap with docsUrl provenance for transparency
 *
 * The LLM is still given an http_get tool for any follow-up fetches it needs
 * (e.g. fetching a specific sub-page it found referenced in the docs).
 */
export async function discoverEndpoints(
  serviceId: string,
  credentials: Record<string, string>,
  llmKey: LLMKey
): Promise<EndpointMap> {
  const credentialKeys = Object.keys(credentials).join(", ");
  const credentialValues = Object.entries(credentials)
    .map(([k, v]) => `${k}: ${v.slice(0, 8)}...`)
    .join(", ");

  // ── Step 1: Fetch real documentation BEFORE calling the LLM ─────────────
  console.log(`[Discovery] Fetching live API documentation for: ${serviceId}`);
  const docResult = await fetchApiDocs(serviceId, 4, 8_000);
  console.log(
    `[Discovery] Docs fetched: ${docResult.fetchedUrls.length} pages, ${docResult.text.length} chars, ` +
    `fromSearch=${docResult.fromSearch}, url=${docResult.docsUrl}`
  );

  // ── Step 2: Build the LLM prompt with actual doc content ─────────────────
  // NOTE: No pre-filtering here. We collect ALL GET endpoints from the docs.
  // The verification step (verifyAndFetch) is the real gate — it calls every endpoint
  // with real credentials and only keeps those that return actual data.
  // Pre-filtering by "monitoring-relevant" caused us to miss endpoints and rely on
  // LLM judgment about what MIGHT be useful before we even know what the endpoint returns.
  const systemPrompt = `You are Eagle Eye's API discovery agent. Your job is to produce a complete, executable call specification for every endpoint in the provided API documentation.

CORE PRINCIPLE: You are building a generic API executor. You must store EVERYTHING the API needs to make a successful call — no assumptions, no defaults, no shortcuts. The executor will use exactly what you provide and nothing else.

RULES:
- Extract EVERY endpoint you find in the documentation — do not pre-filter or skip any
- Do NOT rely on your training knowledge — only extract endpoints you can see in the documentation below
- For EACH endpoint, capture the COMPLETE call specification:
  * headers: ALL required headers (auth, content-type, API version headers, custom headers — whatever the API requires)
  * queryParams: ALL query parameters the API requires or recommends for useful output (date ranges, pagination, granularity, expand fields, filters, etc.)
  * body: request body for POST/PUT/PATCH endpoints
  * extractFrom: if this endpoint returns IDs needed by other endpoints, specify exactly how to extract them
  * dependsOn: list URLs of endpoints that must be called first to resolve IDs this endpoint needs
- Use {placeholder} tokens for any value that comes from credentials or a prior response:
  * Credential fields: use the EXACT field name from the credentials object (e.g. {key}, {apiToken}, {accountSid})
  * IDs from prior responses: use descriptive names like {org_id}, {team_id}, {project_id}, {account_id}
  * Computed values: use {month_start_unix} for start of current month as Unix timestamp, {today_iso} for today as ISO date
- Use the LATEST API version shown in the docs
- You also have an http_get tool — use it ONLY if you need to fetch a specific sub-page referenced in the docs
EXPIRY DETECTION (critical):
- Look for any endpoint that returns token/key/credential metadata — these often contain expiry information
- Common patterns: GET /token, GET /v1/me, GET /user, GET /tokens/{id}, GET /api-keys/{id}, GET /credentials
- If such an endpoint exists, set "expiryField" to the dot-notation path of the expiry timestamp in the response
  (e.g. "token.expires_at", "data.expiry", "key.valid_until", "expires_at")
- If the endpoint has NO expiry field in the docs, set "expiryField" to null — this tells Eagle Eye not to ask the user
- If you cannot determine whether expiry exists, omit "expiryField" entirely
CATEGORIES (for display grouping only — do NOT use to filter):
- "usage": API calls, tokens, requests, bandwidth, storage consumed
- "billing": spend, invoices, subscription, payment
- "health": service status, uptime, degradation
- "limits": rate limits, quotas, hard/soft limits, remaining quota
- "account": user profile, org info, plan tier, seats, features
- "info": anything else (list endpoints, metadata, config)`;

  const userMessage = `Produce complete call specifications for ALL endpoints of: "${serviceId}"

Credentials available (field names you can use as {placeholders}):
${Object.entries(credentials).map(([k, v]) => `  ${k}: ${v.slice(0, 6)}... (use as {${k}})`).join("\n")}

=== REAL API DOCUMENTATION (fetched live from ${docResult.docsUrl}) ===
${docResult.text.slice(0, 24_000)}
=== END OF DOCUMENTATION ===

For each endpoint, produce a COMPLETE call spec. Include every header, every required query param, every body field.
Return a JSON object (no markdown, no explanation):
{
  "serviceName": "Human readable name",
  "apiBaseUrl": "https://api.example.com",
  "endpoints": [
    {
      "url": "https://api.example.com/v1/usage/{org_id}",
      "method": "GET",
      "description": "Monthly API usage broken down by day",
      "category": "usage",
      "headers": {
        "Authorization": "Bearer {key}",
        "X-API-Version": "2024-01"
      },
      "queryParams": {
        "start_time": "{month_start_unix}",
        "granularity": "day",
        "limit": "100"
      },
      "dependsOn": ["https://api.example.com/v1/orgs"],
      "extractFrom": [
        { "path": "orgs[0].id", "storeAs": "org_id" }
      ]
    }
  ]
}

IMPORTANT:
- Every endpoint needs a complete headers object — never omit auth
- Include queryParams whenever the API accepts date ranges, pagination, filters, or expansion fields
- If the docs show an endpoint needs an ID from another endpoint, use dependsOn + extractFrom
- Use {month_start_unix} for Unix timestamp of start of current month where APIs need date ranges
- Use {today_iso} for today\'s date in ISO format where APIs need date strings
- If the documentation above is insufficient, use the http_get tool to fetch additional pages`;

  // ── Step 3: Call LLM with doc content + http_get tool for follow-up ──────
  const tools = [
    {
      name: "http_get",
      description: "Fetch a URL and return its content. Use ONLY for additional doc pages not already provided above.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
          headers: { type: "object", description: "Optional HTTP headers", additionalProperties: { type: "string" } },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  ];

  let result: string;
  try {
    result = await callLLMWithTools(
      systemPrompt,
      userMessage,
      tools,
      llmKey,
      async (name, input) => {
        if (name === "http_get") {
          try {
            const res = await fetchWithTimeout(input.url, { headers: input.headers ?? {} }, 10_000);
            const html = await res.text();
            // Strip HTML before returning to LLM so it reads clean text
            const { htmlToText } = await import("./doc-fetcher");
            return htmlToText(html).slice(0, 8_000);
          } catch (e) {
            return `Error fetching ${input.url}: ${String(e)}`;
          }
        }
        return "Unknown tool";
      },
      8 // Fewer turns needed since we already provide the docs
    );
  } catch (e) {
    // LLM call failed (bad key, quota, network) — return empty map so scan continues without crashing
    console.warn(`[Discovery] LLM call failed for ${serviceId}:`, String(e));
    return {
      serviceId,
      serviceName: serviceId,
      apiBaseUrl: `https://api.${serviceId}.com`,
      endpoints: [],
      discoveredAt: new Date().toISOString(),
      discoveryVersion: 3,
      docsUrl: docResult.docsUrl,
      docsFromSearch: docResult.fromSearch,
    };
  }

  // ── Step 4: Parse LLM response ────────────────────────────────────────────
  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      serviceId,
      serviceName: parsed.serviceName || serviceId,
      apiBaseUrl: parsed.apiBaseUrl || `https://api.${serviceId}.com`,
      endpoints: (parsed.endpoints || []).map((e: any) => ({
        url: e.url,
        method: e.method || "GET",
        description: e.description || "",
        category: e.category || "info",
        // Full open call spec — whatever the LLM extracted from docs
        headers: e.headers || {},
        queryParams: e.queryParams,
        body: e.body,
        callConfig: e.callConfig,
        dependsOn: e.dependsOn,
        extractFrom: e.extractFrom,
        // Legacy compat: keep authHeader if headers map is empty
        authHeader: (!e.headers || Object.keys(e.headers).length === 0) ? (e.authHeader || "") : undefined,
        verified: false,
      })),
      discoveredAt: new Date().toISOString(),
      discoveryVersion: 3, // v3: open call spec with full params/headers/body
      docsUrl: docResult.docsUrl,
      docsFromSearch: docResult.fromSearch,
    };
  } catch {
    // Fallback: return empty map if LLM failed to produce valid JSON
    console.warn(`[Discovery] LLM failed to produce valid JSON for ${serviceId}`);
    return {
      serviceId,
      serviceName: serviceId,
      apiBaseUrl: `https://api.${serviceId}.com`,
      endpoints: [],
      discoveredAt: new Date().toISOString(),
      discoveryVersion: 3,
      docsUrl: docResult.docsUrl,
      docsFromSearch: docResult.fromSearch,
    };
  }
}

// ── Phase 2: Verify endpoints and fetch live data ────────────────────────────

export async function verifyAndFetch(
  endpointMap: EndpointMap,
  credentials: Record<string, string>
): Promise<LiveProviderData> {
  const results: LiveProviderData["endpoints"] = [];
  const rawBodies: Record<string, string> = {};

  // First pass: fetch endpoints that don't have placeholders (or resolve simple ones)
  // We need to resolve IDs like {project_id} by fetching parent endpoints first
  const resolvedIds: Record<string, string> = { ...credentials };

  // Inject computed placeholders that many APIs need
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  resolvedIds["month_start_unix"] = String(Math.floor(monthStart.getTime() / 1000));
  resolvedIds["month_start_ms"] = String(monthStart.getTime());
  resolvedIds["month_start_iso"] = monthStart.toISOString().slice(0, 10);
  resolvedIds["today_iso"] = now.toISOString().slice(0, 10);
  resolvedIds["today_unix"] = String(Math.floor(now.getTime() / 1000));
  resolvedIds["year"] = String(now.getFullYear());
  resolvedIds["month"] = String(now.getMonth() + 1).padStart(2, "0");

  // Sort: endpoints with no unresolved URL placeholders first (dependency ordering)
  // Endpoints that depend on IDs from other endpoints go last
  const sorted = [...endpointMap.endpoints].sort((a, b) => {
    const countUnresolved = (ep: DiscoveredEndpoint) =>
      (ep.url.match(/\{[^}]+\}/g) || []).filter(p => !resolvedIds[p.slice(1, -1)]).length;
    return countUnresolved(a) - countUnresolved(b);
  });

  let credentialErrorDetected = false;
  let credentialErrorMessage = "";

  for (const endpoint of sorted) {
    // Resolve URL placeholders
    const resolvedUrl = resolvePlaceholders(endpoint.url, resolvedIds);

    // Skip if URL still has unresolved placeholders after all resolution attempts
    if (resolvedUrl.includes("{") && resolvedUrl.includes("}")) {
      results.push({
        url: endpoint.url,
        description: endpoint.description,
        category: endpoint.category,
        status: 0,
        ok: false,
        data: null,
        error: `Unresolved placeholder in URL: ${resolvedUrl.match(/\{[^}]+\}/g)?.join(", ")}`,
      });
      continue;
    }

    // Build full URL with resolved query params
    const finalUrl = appendQueryParams(resolvedUrl, endpoint.queryParams, resolvedIds);

    // Build headers from the open call spec (supports both new map format and legacy string)
    const headers = buildHeaders(endpoint, resolvedIds);

    // Build request init
    const init: RequestInit = { headers };
    if (endpoint.method && endpoint.method !== "GET" && endpoint.body) {
      const resolvedBody = resolveDeep(endpoint.body, resolvedIds);
      init.body = JSON.stringify(resolvedBody);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        (headers as any)["Content-Type"] = "application/json";
      }
    }
    init.method = endpoint.method || "GET";

    // Respect callConfig timeout if specified
    const timeout = endpoint.callConfig?.timeout ?? 12_000;

    try {
      const res = await fetchWithTimeout(finalUrl, init, timeout);
      const body = await res.text();
      rawBodies[finalUrl] = body.slice(0, 2000);

      let data: any = null;
      try { data = JSON.parse(body); } catch { data = body.slice(0, 500); }

      const credErr = isCredentialError(res.status, body);
      const quotaErr = isQuotaError(res.status, body);

      if (credErr && !credentialErrorDetected) {
        credentialErrorDetected = true;
        credentialErrorMessage = res.status === 401
          ? `API key for ${endpointMap.serviceName} is invalid or expired (HTTP ${res.status})`
          : res.status === 403
          ? `API key for ${endpointMap.serviceName} lacks required permissions (HTTP ${res.status})`
          : `Authentication failed for ${endpointMap.serviceName}: ${body.slice(0, 200)}`;
      }

      // Extract IDs from successful responses using explicit extractFrom spec
      if (res.ok && data && typeof data === "object") {
        // Use LLM-specified extraction paths first
        if (endpoint.extractFrom && endpoint.extractFrom.length > 0) {
          for (const { path, storeAs } of endpoint.extractFrom) {
            const extracted = extractByPath(data, path);
            if (extracted && !resolvedIds[storeAs]) {
              resolvedIds[storeAs] = extracted;
              console.log(`[Discovery] Extracted ${storeAs}=${extracted} from ${finalUrl}`);
            }
          }
        }
        // Also run the generic heuristic extractor as a fallback
        extractAndStoreIds(data, resolvedIds, endpointMap.serviceId);

        // Auto-extract key expiry if this endpoint has an expiryField spec
        if (endpoint.expiryField && !endpointMap.keyExpiresAt) {
          const rawExpiry = extractByPath(data, endpoint.expiryField);
          if (rawExpiry) {
            // Normalize: handle Unix timestamps (seconds or ms) and ISO strings
            let expiryIso: string | null = null;
            const asNum = Number(rawExpiry);
            if (!isNaN(asNum) && asNum > 0) {
              // Unix timestamp: if < 1e10 it's seconds, otherwise ms
              const ms = asNum < 1e10 ? asNum * 1000 : asNum;
              expiryIso = new Date(ms).toISOString();
            } else if (rawExpiry.match(/^\d{4}-/)) {
              expiryIso = new Date(rawExpiry).toISOString();
            }
            if (expiryIso) {
              endpointMap.keyExpiresAt = expiryIso;
              endpointMap.expiryChecked = true;
              console.log(`[Discovery] Auto-detected key expiry for ${endpointMap.serviceId}: ${expiryIso}`);
            }
          }
        }
        // If expiryField is explicitly null, the LLM confirmed no expiry exists
        if (endpoint.expiryField === null && endpointMap.expiryChecked === undefined) {
          endpointMap.keyExpiresAt = null;
          endpointMap.expiryChecked = true;
          console.log(`[Discovery] ${endpointMap.serviceId}: LLM confirmed no key expiry concept`);
        }
      }

      results.push({
        url: finalUrl,
        description: endpoint.description,
        category: endpoint.category,
        status: res.status,
        ok: res.ok && !credErr,
        data: res.ok && !credErr ? data : null,
        error: credErr ? credentialErrorMessage : quotaErr ? "Quota/rate limit reached" : res.ok ? undefined : `HTTP ${res.status}`,
        credentialError: credErr,
      });

      // Mark endpoint as verified if it returned real data
      endpoint.verified = res.ok && !credErr;
      endpoint.lastStatus = res.status;
      endpoint.lastResponseSnippet = body.slice(0, 500);

    } catch (e) {
      results.push({
        url: finalUrl,
        description: endpoint.description,
        category: endpoint.category,
        status: 0,
        ok: false,
        data: null,
        error: `Network error: ${String(e)}`,
      });
    }
  }

  // Build summary signals
  const successCount = results.filter(r => r.ok).length;
  const totalCount = results.length;
  const criticalCategories = results.filter(r => r.ok && (r.category === "billing" || r.category === "usage" || r.category === "limits"));

  let status: LiveProviderData["_status"] = "good";
  let signal = `${successCount}/${totalCount} endpoints returned data.`;
  let summary = endpointMap.serviceName;

  if (credentialErrorDetected) {
    status = "credential_error";
    signal = credentialErrorMessage;
    summary = `${endpointMap.serviceName} — credential error`;
  } else if (successCount === 0) {
    status = "warn";
    signal = "No endpoints returned data. The service may be unreachable or credentials may be incorrect.";
  } else if (criticalCategories.length > 0) {
    summary = `${endpointMap.serviceName} · ${successCount} data sources`;
  }

  return {
    serviceId: endpointMap.serviceId,
    serviceName: endpointMap.serviceName,
    endpoints: results,
    _summary: summary,
    _signal: signal,
    _status: status,
    _credentialError: credentialErrorDetected ? credentialErrorMessage : undefined,
    _rawBodies: rawBodies,
  };
}

// ── Helper: extract IDs from API responses for chained calls ─────────────────

function extractAndStoreIds(data: any, store: Record<string, string>, serviceId: string): void {
  // Common ID patterns across APIs
  const idPatterns: Array<[string | RegExp, string[]]> = [
    ["id", ["id", `${serviceId}_id`]],
    ["ref", ["ref", "project_ref"]],
    ["project_id", ["project_id"]],
    ["account_id", ["account_id"]],
    ["org_id", ["org_id", "organization_id"]],
    ["team_id", ["team_id"]],
    ["workspace_id", ["workspace_id"]],
  ];

  function extract(obj: any, depth = 0): void {
    if (depth > 3 || !obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      // Take first item from arrays (most APIs return the primary resource first)
      if (obj.length > 0) extract(obj[0], depth + 1);
      return;
    }

    for (const [pattern, storeKeys] of idPatterns) {
      const key = typeof pattern === "string" ? pattern : null;
      if (key && obj[key] && typeof obj[key] === "string" && !store[key]) {
        for (const storeKey of storeKeys) {
          if (!store[storeKey]) store[storeKey] = obj[key];
        }
      }
    }

    // Recurse into nested objects
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") extract(val, depth + 1);
    }
  }

  extract(data);
}

// ── Phase 3: LLM summarization ───────────────────────────────────────────────────────────────────

/**
 * Takes raw endpoint fetch results and asks the LLM to extract only useful
 * information, grouped by category (health, usage, billing, limits, warnings).
 * Returns a clean ProviderSummary ready for dashboard display.
 */
export async function summarizeProviderData(
  liveData: LiveProviderData,
  llmKey: LLMKey
): Promise<ProviderSummary> {
  // If credential error, return immediately without LLM call
  if (liveData._status === "credential_error") {
    return {
      serviceId: liveData.serviceId,
      serviceName: liveData.serviceName,
      status: "credential_error",
      credentialError: liveData._credentialError ?? "API key is invalid or expired",
      groups: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  // Build context from raw bodies
  const rawContext = Object.entries(liveData._rawBodies)
    .map(([url, body]) => {
      const ep = liveData.endpoints.find(e => e.url === url);
      return `=== ${ep?.description ?? url} (${ep?.category ?? "info"}) ===\n${body.slice(0, 1500)}`;
    })
    .join("\n\n");

  if (!rawContext.trim()) {
    return {
      serviceId: liveData.serviceId,
      serviceName: liveData.serviceName,
      status: "warn",
      groups: [{
        category: "warnings",
        label: "Warnings",
        items: [{ key: "No data", value: "No endpoints returned data. Check credentials.", alert: "warn" }],
      }],
      lastUpdated: new Date().toISOString(),
    };
  }

  const systemPrompt = `You are Eagle Eye's data extraction agent. You receive raw API responses from a service and must extract ONLY the useful monitoring information.

RULES:
- Extract numbers, statuses, dates, and limits — ignore boilerplate, metadata, and irrelevant fields
- Group information into categories: health, usage, billing, limits, warnings
- Only include a category if you found real data for it
- For warnings: include anything that looks like a problem (high usage, approaching limits, degraded services, failed checks)
- Be concise: key names should be 1-4 words, values should be short and human-readable
- For monetary values: always include currency symbol
- For percentages: always include % symbol
- For storage: use appropriate units (GB, MB, TB)
- Determine overall status: "good" (all normal), "warn" (something needs attention), "critical" (immediate action needed)

Return ONLY valid JSON matching this exact schema:
{
  "status": "good" | "warn" | "critical",
  "groups": [
    {
      "category": "health" | "usage" | "billing" | "limits" | "warnings" | "info",
      "label": "string",
      "items": [
        { "key": "string", "value": "string", "alert": "warn" | "critical" | null }
      ]
    }
  ]
}`;

  const userMessage = `Service: ${liveData.serviceName}

API Response Data:
${rawContext}

Extract all useful monitoring information and return the JSON summary.`;

  try {
    let jsonText = "";

    if (llmKey.provider === "anthropic") {
      const client = new Anthropic({ apiKey: llmKey.apiKey, timeout: 60_000 });
      const response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      jsonText = textBlock?.text ?? "{}";
    } else if (llmKey.provider === "openai" || llmKey.provider === "ollama") {
      const clientOpts: any = { apiKey: llmKey.apiKey, timeout: 60_000 };
      if (llmKey.provider === "ollama") {
        // Normalize: ensure base URL ends with /v1
        const rawBase = llmKey.baseURL ?? "http://localhost:11434";
        clientOpts.baseURL = rawBase.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1";
      }
      const client = new OpenAI(clientOpts);
      const model = llmKey.provider === "ollama" ? (llmKey.model ?? "llama3.1:8b") : "gpt-4o";
      const response = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });
      jsonText = response.choices[0].message.content ?? "{}";
    } else {
      // Gemini fallback — text only
      const genAI = new GoogleGenerativeAI(llmKey.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const geminiResult = await model.generateContent(`${systemPrompt}\n\n${userMessage}\n\nReturn ONLY the JSON, no other text.`);
      jsonText = geminiResult.response.text();
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/) ?? jsonText.match(/({[\s\S]*})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : jsonText);

    const groups: ProviderSummaryGroup[] = (parsed.groups ?? []).map((g: any) => ({
      category: g.category ?? "info",
      label: g.label ?? g.category ?? "Info",
      items: (g.items ?? []).map((item: any) => ({
        key: item.key ?? "",
        value: item.value ?? "",
        alert: item.alert === "warn" || item.alert === "critical" ? item.alert : undefined,
      })),
    }));

    return {
      serviceId: liveData.serviceId,
      serviceName: liveData.serviceName,
      status: parsed.status ?? liveData._status,
      groups,
      lastUpdated: new Date().toISOString(),
    };

  } catch (e) {
    console.error(`[Summarize] Failed to summarize ${liveData.serviceName}:`, e);
    // Fallback: return basic summary without LLM
    return {
      serviceId: liveData.serviceId,
      serviceName: liveData.serviceName,
      status: (liveData._status as string) === "credential_error" ? "credential_error" : "warn",
      groups: [{
        category: "info",
        label: "Status",
        items: [{ key: "Endpoints", value: `${liveData.endpoints.filter(e => e.ok).length}/${liveData.endpoints.length} returned data` }],
      }],
      lastUpdated: new Date().toISOString(),
    };
  }
}

// ── Main entry point: full discovery + fetch + summarize pipeline ─────────────────

export async function runDynamicProvider(
  serviceId: string,
  credentials: Record<string, string>,
  llmKey: LLMKey,
  cachedEndpointMap?: EndpointMap | null
): Promise<{ liveData: LiveProviderData; summary: ProviderSummary; endpointMap: EndpointMap }> {
  let endpointMap = cachedEndpointMap;

  // Phase 1: Discover endpoints (only if no cache)
  if (!endpointMap || endpointMap.endpoints.length === 0) {
    console.log(`[Discovery] Running endpoint discovery for: ${serviceId}`);
    endpointMap = await discoverEndpoints(serviceId, credentials, llmKey);
    console.log(`[Discovery] Found ${endpointMap.endpoints.length} endpoints for ${serviceId}`);
  } else {
    console.log(`[Discovery] Using cached endpoint map for ${serviceId} (${endpointMap.endpoints.length} endpoints)`);
  }

  // Phase 2: Verify and fetch live data
  const liveData = await verifyAndFetch(endpointMap, credentials);
  console.log(`[Discovery] ${serviceId}: ${liveData.endpoints.filter(e => e.ok).length}/${liveData.endpoints.length} endpoints verified`);

  // Phase 3: LLM summarization — extract useful grouped data
  const summary = await summarizeProviderData(liveData, llmKey);
  console.log(`[Discovery] ${serviceId}: summary status=${summary.status}, groups=${summary.groups.length}`);

  return { liveData, summary, endpointMap };
}
