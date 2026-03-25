/**
 * Eagle Eye — Endpoint Map Store
 *
 * Persists discovered endpoint maps to Supabase so discovery only runs once per service.
 * All future scans for the same service reuse the cached map.
 *
 * Table: provider_endpoint_maps
 * - id: uuid
 * - service_id: text (e.g. "stripe", "planetscale")
 * - endpoint_map: jsonb (the full EndpointMap object)
 * - created_at: timestamptz
 * - updated_at: timestamptz
 * - discovery_version: int (bump to force re-discovery)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EndpointMap } from "./discovery-engine";

const TABLE = "provider_endpoint_maps";

/**
 * Load a cached endpoint map for a service.
 * Returns null if not found.
 */
export async function loadEndpointMap(
  supabase: SupabaseClient,
  serviceId: string
): Promise<EndpointMap | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("endpoint_map")
    .eq("service_id", serviceId)
    .maybeSingle();

  if (error || !data) return null;
  return data.endpoint_map as EndpointMap;
}

/**
 * Save or update an endpoint map for a service.
 * Uses upsert so it works for both first-time discovery and re-discovery.
 */
export async function saveEndpointMap(
  supabase: SupabaseClient,
  serviceId: string,
  endpointMap: EndpointMap
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        service_id: serviceId,
        endpoint_map: endpointMap,
        updated_at: new Date().toISOString(),
        discovery_version: endpointMap.discoveryVersion,
      },
      { onConflict: "service_id" }
    );

  if (error) {
    console.error(`[EndpointStore] Failed to save endpoint map for ${serviceId}:`, error.message);
  }
}

/**
 * Delete a cached endpoint map (forces re-discovery on next scan).
 */
export async function deleteEndpointMap(
  supabase: SupabaseClient,
  serviceId: string
): Promise<void> {
  await supabase.from(TABLE).delete().eq("service_id", serviceId);
}

/**
 * List all cached service IDs.
 */
export async function listCachedServices(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data } = await supabase.from(TABLE).select("service_id");
  return (data ?? []).map((r: any) => r.service_id);
}
