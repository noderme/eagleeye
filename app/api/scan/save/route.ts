import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MOCK_MODE_ENABLED } from "@/lib/config";

export async function POST(req: NextRequest) {
  const { result } = await req.json();
  if (!result) return NextResponse.json({ error: "result required" }, { status: 400 });

  // In mock mode, skip database save and return the result as-is
  if (MOCK_MODE_ENABLED) {
    console.log("[Eagle Eye] Mock mode: skipping database save");
    return NextResponse.json({ result: { ...result, id: "mock-saved-001" } });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: saved, error } = await service
    .from("scan_results")
    .insert({
      user_id: user.id,
      scanned_at: result.scanned_at ?? new Date().toISOString(),
      github_data: result.github_data,
      provider_data: result.provider_data,
      domain_data: result.domain_data,
      analysis: result.analysis,
      error: result.error,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Write auto-detected key expiry back to user_api_keys.extra_config
  // This is fire-and-forget — we don't block the response on it.
  // _expiryChecked=true means the discovery engine explicitly checked for expiry in the docs.
  // _keyExpiresAt is either an ISO string (found), null (confirmed absent), or undefined (not checked).
  const providerData: Record<string, any> = result.provider_data ?? {};
  const expiryUpdates = Object.entries(providerData)
    .filter(([, v]: [string, any]) => v?._expiryChecked === true)
    .map(async ([provider, v]: [string, any]) => {
      // Merge with existing extra_config to preserve other fields (e.g. manually-set expiry)
      const { data: existing } = await service
        .from("user_api_keys")
        .select("extra_config")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .is("revoked_at", null)
        .maybeSingle();

      // Only auto-update if user hasn't manually set a keyExpiresAt already
      const existingConfig = existing?.extra_config ?? {};
      if (existingConfig.keyExpiresAt && !existingConfig._autoDetectedExpiry) {
        // User manually set this — don't overwrite
        return;
      }

      const merged = {
        ...existingConfig,
        expiryChecked: true,
        _autoDetectedExpiry: true,
        ...(v._keyExpiresAt !== undefined ? { keyExpiresAt: v._keyExpiresAt } : {}),
      };

      await service
        .from("user_api_keys")
        .update({ extra_config: merged })
        .eq("user_id", user.id)
        .eq("provider", provider)
        .is("revoked_at", null);

      console.log(`[Expiry] Updated ${provider}: keyExpiresAt=${v._keyExpiresAt ?? "null (no expiry concept)"}`);
    });

  Promise.allSettled(expiryUpdates).catch(console.error);

  return NextResponse.json({ result: saved });
}
