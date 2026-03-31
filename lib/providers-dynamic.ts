/**
 * Eagle Eye — Dynamic Provider Runner
 *
 * Every service — Vercel, OpenAI, Stripe, GitHub, Anthropic, or any custom service —
 * goes through the SAME pipeline:
 *
 * 1. Check DB for a cached endpoint map (30-day TTL)
 * 2. If no cache → fetch live API docs → LLM extracts complete call specs
 * 3. Verify every endpoint with real HTTP calls using the user's credentials
 * 4. Cache only the verified endpoints to DB for future scans
 * 5. LLM summarizes the live data into structured groups for the dashboard
 *
 * There is no "known" vs "unknown" distinction. No hardcoded fetchers.
 * If the LLM misses an endpoint, we improve the discovery prompt — not add more hardcoding.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { type Credentials, checkDomain } from "@/lib/providers";
import { runDynamicProvider, type LiveProviderData, type ProviderSummary } from "@/lib/discovery-engine";
import { loadEndpointMap, saveEndpointMap } from "@/lib/endpoint-store";
import { MOCK_MODE_ENABLED } from "@/lib/config";
import { getMockProvider } from "@/lib/mock-providers";
import { friendlyError } from "@/lib/errors";
import type { LLMKey } from "@/lib/analyze";
import { tryExtractExpiryFromCredentials } from "@/lib/key-expiry-extractor";

export type { Credentials };

/**
 * Run all providers through the unified dynamic discovery pipeline.
 * Returns the same shape as the old runAllProviders for full backward compatibility.
 */
export async function runAllProvidersDynamic(
  credentials: Credentials,
  domains: string[],
  llmKey?: LLMKey
): Promise<{ providers: Record<string, any>; domains: any[] }> {
  const service = createServiceClient();
  const tasks: Promise<any>[] = [];
  const keys: string[] = [];

  for (const [provider, creds] of Object.entries(credentials)) {
    if (provider === "domains") continue;

    if (MOCK_MODE_ENABLED) {
      const mockData = getMockProvider(provider);
      tasks.push(Promise.resolve(mockData ?? { provider, _skipped: true }));
    } else if (llmKey) {
      // Every service goes through the same LLM discovery pipeline
      tasks.push(runDynamicProviderWithCache(provider, creds, llmKey, service));
    } else {
      // No LLM key configured — cannot run discovery
      tasks.push(
        Promise.resolve({
          provider,
          _unknown: true,
          _noLlmKey: true,
          credentialFields: Object.keys(creds),
          _summary: `${provider} — add an LLM key to enable discovery`,
          _signal: "Connect an OpenAI, Anthropic, or Ollama key on the Integrations page to enable automatic API discovery.",
          _status: "warn",
        })
      );
    }
    keys.push(provider);
  }

  const [providerResults, domainResults] = await Promise.all([
    Promise.allSettled(tasks),
    Promise.all(domains.map(checkDomain)),
  ]);

  const providers: Record<string, any> = {};
  providerResults.forEach((result, i) => {
    providers[keys[i]] =
      result.status === "fulfilled"
        ? result.value
        : {
            provider: keys[i],
            error: friendlyError((result as PromiseRejectedResult).reason),
            _summary: `${keys[i]} — scan error`,
            _signal: friendlyError((result as PromiseRejectedResult).reason),
            _status: "warn",
          };
  });

  return { providers, domains: domainResults };
}

/**
 * Run dynamic discovery for a provider, with DB caching.
 * Returns LiveProviderData with _providerSummary attached for dashboard display.
 */
async function runDynamicProviderWithCache(
  serviceId: string,
  creds: Record<string, string>,
  llmKey: LLMKey,
  supabase: ReturnType<typeof createServiceClient>
): Promise<LiveProviderData & { _providerSummary?: ProviderSummary; _keyExpiresAt?: string | null; _expiryChecked?: boolean }> {
  // Load cached endpoint map from DB
  const cachedMap = await loadEndpointMap(supabase, serviceId);

  // Run discovery + fetch + LLM summarization
  const { liveData, summary, endpointMap } = await runDynamicProvider(
    serviceId,
    creds,
    llmKey,
    cachedMap
  );

  // Save updated endpoint map back to DB — ONLY store verified endpoints.
  // Discovery collects ALL endpoints from docs (no pre-filter).
  // Verification is the real gate: only endpoints that returned real data get cached.
  // This keeps the cache lean and ensures future scans only hit working endpoints.
  const verifiedEndpoints = endpointMap.endpoints.filter(e => e.verified === true);
  const hasNewVerifications = verifiedEndpoints.length > 0 &&
    (!cachedMap || verifiedEndpoints.some(e => !cachedMap.endpoints.find(c => c.url === e.url && c.verified)));

  if (hasNewVerifications || !cachedMap) {
    const mapToSave = {
      ...endpointMap,
      endpoints: verifiedEndpoints,
    };
    await saveEndpointMap(supabase, serviceId, mapToSave);
    console.log(
      `[Cache] ${serviceId}: saved ${verifiedEndpoints.length} verified endpoints ` +
      `(dropped ${endpointMap.endpoints.length - verifiedEndpoints.length} unverified)`
    );
  }

  // If the discovery engine didn't find expiry from the API, try extracting it from the
  // credential value itself (e.g. JWT tokens embed exp claim directly)
  let keyExpiresAt = endpointMap.keyExpiresAt;
  if (keyExpiresAt === undefined) {
    const fromKey = tryExtractExpiryFromCredentials(creds);
    if (fromKey) {
      keyExpiresAt = fromKey;
      console.log(`[Expiry] ${serviceId}: extracted expiry from key value: ${fromKey}`);
    }
  }

  // Attach structured summary for dashboard rendering
  // Also surface expiry detection results so the scan save route can write them back to user_api_keys
  return {
    ...liveData,
    _providerSummary: summary,
    _keyExpiresAt: keyExpiresAt,                        // ISO string if found, null if confirmed absent
    _expiryChecked: endpointMap.expiryChecked ?? false, // true if LLM explicitly checked
  };
}
