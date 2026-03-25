/**
 * Eagle Eye — Endpoint Map Store
 *
 * Persists discovered endpoint maps to Supabase so discovery only runs once per service.
 * All future scans for the same service reuse the cached map.
 *
 * Reuse strategy:
 * - First time a service is added → fetch live docs → discover endpoints → verify → save
 * - Every subsequent scan → read from provider_endpoint_maps → skip discovery
 * - If map is older than REFRESH_AFTER_DAYS → treat as expired → re-run discovery
 *
 * Table: provider_endpoint_maps
 * - id: uuid
 * - service_id: text (e.g. "stripe", "vercel")
 * - endpoint_map: jsonb (the full EndpointMap object)
 * - docs_url: text (where documentation was sourced from)
 * - docs_from_search: boolean (true = found via web search, false = guessed URL)
 * - created_at: timestamptz
 * - updated_at: timestamptz
 * - last_verified_at: timestamptz (last time endpoints were verified with real credentials)
 * - discovery_version: int (bump to force re-discovery for all services)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EndpointMap } from "./discovery-engine";

const TABLE = "provider_endpoint_maps";

/**
 * How many days before a cached endpoint map is considered stale and re-discovered.
 * APIs change — 30 days is a reasonable balance between freshness and LLM cost.
 */
const REFRESH_AFTER_DAYS = 30;

/**
 * Current discovery engine version.
 * Bump this to force re-discovery of ALL services (e.g. when the engine logic changes significantly).
 */
const CURRENT_DISCOVERY_VERSION = 2;

/**
 * Load a cached endpoint map for a service.
 * Returns null if:
 * - Not found in database
 * - Map is older than REFRESH_AFTER_DAYS
 * - Map was created with an older discovery_version
 *
 * When null is returned, the caller should run fresh discovery.
 */
export async function loadEndpointMap(
  supabase: SupabaseClient,
  serviceId: string
): Promise<EndpointMap | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("endpoint_map, updated_at, discovery_version")
    .eq("service_id", serviceId)
    .maybeSingle();

  if (error || !data) return null;

  // Check if map is from an older discovery version
  if ((data.discovery_version ?? 1) < CURRENT_DISCOVERY_VERSION) {
    console.log(
      `[EndpointStore] ${serviceId}: discovery_version ${data.discovery_version} < ${CURRENT_DISCOVERY_VERSION}, forcing re-discovery`
    );
    return null;
  }

  // Check if map is stale (older than REFRESH_AFTER_DAYS)
  if (data.updated_at) {
    const updatedAt = new Date(data.updated_at);
    const ageMs = Date.now() - updatedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > REFRESH_AFTER_DAYS) {
      console.log(
        `[EndpointStore] ${serviceId}: map is ${ageDays.toFixed(1)} days old (>${REFRESH_AFTER_DAYS}), forcing re-discovery`
      );
      return null;
    }
    console.log(
      `[EndpointStore] ${serviceId}: using cached map (${ageDays.toFixed(1)} days old, refreshes after ${REFRESH_AFTER_DAYS} days)`
    );
  }

  return data.endpoint_map as EndpointMap;
}

/**
 * Save or update an endpoint map for a service.
 * Uses upsert so it works for both first-time discovery and re-discovery.
 * Also records docs_url and docs_from_search for provenance tracking.
 */
export async function saveEndpointMap(
  supabase: SupabaseClient,
  serviceId: string,
  endpointMap: EndpointMap
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        service_id: serviceId,
        endpoint_map: endpointMap,
        docs_url: endpointMap.docsUrl ?? null,
        docs_from_search: endpointMap.docsFromSearch ?? false,
        updated_at: now,
        last_verified_at: now,
        discovery_version: endpointMap.discoveryVersion ?? CURRENT_DISCOVERY_VERSION,
      },
      { onConflict: "service_id" }
    );

  if (error) {
    console.error(`[EndpointStore] Failed to save endpoint map for ${serviceId}:`, error.message);
  } else {
    console.log(
      `[EndpointStore] Saved endpoint map for ${serviceId}: ` +
      `${endpointMap.endpoints.length} endpoints, docs=${endpointMap.docsUrl ?? "unknown"}`
    );
  }
}

/**
 * Update the last_verified_at timestamp without changing the endpoint map.
 * Call this after a successful scan to record that the endpoints are still working.
 */
export async function touchEndpointMap(
  supabase: SupabaseClient,
  serviceId: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ last_verified_at: new Date().toISOString() })
    .eq("service_id", serviceId);

  if (error) {
    console.error(`[EndpointStore] Failed to touch endpoint map for ${serviceId}:`, error.message);
  }
}

/**
 * Delete a cached endpoint map (forces re-discovery on next scan).
 * Useful when a user reports that their endpoints are wrong.
 */
export async function deleteEndpointMap(
  supabase: SupabaseClient,
  serviceId: string
): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("service_id", serviceId);
  if (error) {
    console.error(`[EndpointStore] Failed to delete endpoint map for ${serviceId}:`, error.message);
  } else {
    console.log(`[EndpointStore] Deleted endpoint map for ${serviceId} (will re-discover on next scan)`);
  }
}

/**
 * List all cached services with their metadata.
 */
export async function listCachedServices(
  supabase: SupabaseClient
): Promise<Array<{ serviceId: string; docsUrl?: string; updatedAt: string; endpointCount: number }>> {
  const { data } = await supabase
    .from(TABLE)
    .select("service_id, docs_url, updated_at, endpoint_map");

  return (data ?? []).map((r: any) => ({
    serviceId: r.service_id,
    docsUrl: r.docs_url ?? undefined,
    updatedAt: r.updated_at,
    endpointCount: (r.endpoint_map?.endpoints ?? []).length,
  }));
}
