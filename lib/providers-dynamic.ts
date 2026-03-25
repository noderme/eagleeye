/**
 * Eagle Eye — Dynamic Provider Runner
 *
 * Replaces the hardcoded KNOWN_FETCHERS approach with fully dynamic discovery.
 * For any service:
 * 1. Check DB for cached endpoint map
 * 2. If no cache → run LLM discovery to find endpoints
 * 3. Verify endpoints with real HTTP calls
 * 4. Save verified map to DB for future scans
 * 5. Return live data + raw bodies for LLM analysis
 *
 * Known providers (OpenAI, Stripe, etc.) still use their optimized fetchers
 * for reliability, but unknown providers go through dynamic discovery.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { KNOWN_FETCHERS, type Credentials, checkDomain } from "@/lib/providers";
import { runDynamicProvider, type LiveProviderData, type ProviderSummary } from "@/lib/discovery-engine";
import { loadEndpointMap, saveEndpointMap } from "@/lib/endpoint-store";
import { MOCK_MODE_ENABLED } from "@/lib/config";
import { getMockProvider } from "@/lib/mock-providers";
import type { LLMKey } from "@/lib/analyze";

export type { Credentials };

/**
 * Run all providers — known ones use optimized fetchers, unknown ones use dynamic discovery.
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
    } else {
      const knownFetcher = KNOWN_FETCHERS[provider];
      if (knownFetcher) {
        // Use the optimized hardcoded fetcher for known providers
        tasks.push(
          knownFetcher(creds).catch((err: any) => ({
            provider,
            error: String(err),
            _summary: `${provider} — fetch error`,
            _signal: String(err),
            _status: "warn",
          }))
        );
      } else if (llmKey) {
        // Unknown provider — use dynamic discovery
        tasks.push(runDynamicProviderWithCache(provider, creds, llmKey, service));
      } else {
        // No LLM key — return placeholder for unknown providers
        tasks.push(
          Promise.resolve({
            provider,
            _unknown: true,
            _noLlmKey: true,
            credentialFields: Object.keys(creds),
            _summary: `${provider} — add an LLM key to enable dynamic discovery`,
            _signal: "Connect an OpenAI, Anthropic, or Gemini key on the Integrations page to enable automatic API discovery for this service.",
            _status: "warn",
          })
        );
      }
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
            error: String((result as PromiseRejectedResult).reason),
            _summary: `${keys[i]} — error`,
            _signal: String((result as PromiseRejectedResult).reason),
            _status: "warn",
          };
  });

  return { providers, domains: domainResults };
}

/**
 * Run dynamic discovery for an unknown provider, with DB caching.
 * Returns LiveProviderData with _providerSummary attached for dashboard display.
 */
async function runDynamicProviderWithCache(
  serviceId: string,
  creds: Record<string, string>,
  llmKey: LLMKey,
  supabase: ReturnType<typeof createServiceClient>
): Promise<LiveProviderData & { _providerSummary?: ProviderSummary }> {
  // Load cached endpoint map from DB
  const cachedMap = await loadEndpointMap(supabase, serviceId);

  // Run discovery + fetch + LLM summarization
  const { liveData, summary, endpointMap } = await runDynamicProvider(
    serviceId,
    creds,
    llmKey,
    cachedMap
  );

  // Save updated endpoint map back to DB (with verification results)
  if (!cachedMap || endpointMap.endpoints.some(e => e.verified !== cachedMap.endpoints.find(c => c.url === e.url)?.verified)) {
    await saveEndpointMap(supabase, serviceId, endpointMap);
  }

  // Attach structured summary for dashboard rendering
  return { ...liveData, _providerSummary: summary };
}
