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

export interface DiscoveredEndpoint {
  url: string;                  // Full URL with placeholders like {account_id}
  method: "GET" | "POST";
  description: string;          // What this endpoint tells us
  category: "usage" | "billing" | "health" | "limits" | "quotas" | "info";
  authHeader: string;           // e.g. "Authorization: Bearer {api_key}"
  verified: boolean;            // Did it return real data?
  lastStatus?: number;          // Last HTTP status code
  lastResponseSnippet?: string; // First 500 chars of last response
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
  const genAI = new GoogleGenerativeAI(llmKey.apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(`${systemPrompt}\n\n${userMessage}`);
  return result.response.text();
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

function resolveUrl(urlTemplate: string, credentials: Record<string, string>): string {
  let url = urlTemplate;
  for (const [key, value] of Object.entries(credentials)) {
    url = url.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    url = url.replace(new RegExp(`\\{${key.toUpperCase()}\\}`, "g"), value);
  }
  return url;
}

function resolveHeaders(
  authHeaderTemplate: string,
  credentials: Record<string, string>
): Record<string, string> {
  let header = authHeaderTemplate;
  for (const [key, value] of Object.entries(credentials)) {
    header = header.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    header = header.replace(new RegExp(`\\{${key.toUpperCase()}\\}`, "g"), value);
  }

  // Parse "Header-Name: value" format
  const colonIdx = header.indexOf(":");
  if (colonIdx === -1) return { Authorization: header };
  const headerName = header.slice(0, colonIdx).trim();
  const headerValue = header.slice(colonIdx + 1).trim();
  return { [headerName]: headerValue };
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
  const systemPrompt = `You are Eagle Eye's API discovery agent. Your job is to find ALL monitoring-relevant API endpoints for a given service.

MONITORING-RELEVANT means endpoints that return any of:
- Usage statistics (API calls, tokens, requests, bandwidth, storage)
- Billing information (current spend, invoices, subscription plan, limits)
- Health status (service health, uptime, degradation)
- Quota/limit information (rate limits, hard limits, soft limits, remaining quota)
- Account/organization information (plan tier, features, seats)

You have been given REAL documentation fetched from the web. Read it carefully and extract endpoints from what you actually see — do NOT rely on your training knowledge.

IMPORTANT:
- Use placeholder {api_key} for the API key in URLs and headers
- Use placeholder {account_id}, {org_id} etc. for IDs that need to be fetched first
- If an endpoint requires fetching an ID first (e.g., project ID), include both the ID-fetching endpoint AND the data endpoint
- Focus ONLY on GET endpoints (read-only, safe to call)
- Include the auth header format exactly as the documentation specifies
- If the docs mention versioned endpoints (e.g. /v9/, /v2/), use the LATEST version shown in the docs
- You also have an http_get tool — use it ONLY if you need to fetch a specific sub-page referenced in the docs that was not included`;

  const userMessage = `Discover all monitoring-relevant API endpoints for: "${serviceId}"
Credentials provided: ${credentialKeys}
(Values: ${credentialValues})

=== REAL API DOCUMENTATION (fetched live from ${docResult.docsUrl}) ===
${docResult.text.slice(0, 24_000)}
=== END OF DOCUMENTATION ===

Based ONLY on the documentation above, return a JSON object in this exact format (no markdown, no explanation):
{
  "serviceName": "Human readable name",
  "apiBaseUrl": "https://api.example.com",
  "endpoints": [
    {
      "url": "https://api.example.com/v1/usage",
      "method": "GET",
      "description": "Returns current usage statistics",
      "category": "usage",
      "authHeader": "Authorization: Bearer {api_key}"
    }
  ]
}

If the documentation above is insufficient, use the http_get tool to fetch additional pages, then return the JSON.`;

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

  const result = await callLLMWithTools(
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
        authHeader: e.authHeader || "Authorization: Bearer {api_key}",
        verified: false,
      })),
      discoveredAt: new Date().toISOString(),
      discoveryVersion: 2, // Bump version — now using live docs
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
      discoveryVersion: 2,
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

  // Sort: endpoints without unresolved placeholders first
  const sorted = [...endpointMap.endpoints].sort((a, b) => {
    const aUnresolved = (a.url.match(/\{[^}]+\}/g) || []).filter(p => !credentials[p.slice(1, -1)]).length;
    const bUnresolved = (b.url.match(/\{[^}]+\}/g) || []).filter(p => !credentials[p.slice(1, -1)]).length;
    return aUnresolved - bUnresolved;
  });

  let credentialErrorDetected = false;
  let credentialErrorMessage = "";

  for (const endpoint of sorted) {
    const resolvedUrl = resolveUrl(endpoint.url, resolvedIds);
    const headers = resolveHeaders(endpoint.authHeader, resolvedIds);

    // Skip if URL still has unresolved placeholders
    if (resolvedUrl.includes("{") && resolvedUrl.includes("}")) {
      results.push({
        url: endpoint.url,
        description: endpoint.description,
        category: endpoint.category,
        status: 0,
        ok: false,
        data: null,
        error: "Unresolved URL placeholder — missing credential",
      });
      continue;
    }

    try {
      const res = await fetchWithTimeout(resolvedUrl, { headers }, 10_000);
      const body = await res.text();
      rawBodies[resolvedUrl] = body.slice(0, 2000);

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

      // Extract IDs from successful responses for use in subsequent calls
      if (res.ok && data && typeof data === "object") {
        extractAndStoreIds(data, resolvedIds, endpointMap.serviceId);
      }

      results.push({
        url: resolvedUrl,
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
        url: resolvedUrl,
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
      if (llmKey.provider === "ollama") clientOpts.baseURL = (llmKey as any).baseURL ?? "http://localhost:11434/v1";
      const client = new OpenAI(clientOpts);
      const model = llmKey.provider === "ollama" ? ((llmKey as any).model ?? "llama3.1:8b") : "gpt-4o";
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
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(`${systemPrompt}\n\n${userMessage}\n\nReturn ONLY the JSON, no other text.`);
      jsonText = result.response.text();
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
