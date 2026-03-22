import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MOCK_MODE_ENABLED } from "@/lib/config";

export async function GET() {
  // In mock mode, return mock integration status without requiring authentication
  if (MOCK_MODE_ENABLED) {
    console.log("[Eagle Eye] Mock mode: returning mock keys status");
    return NextResponse.json({
      integrations: [
        { provider: "openai", created_at: new Date(Date.now() - 30 * 86400000).toISOString(), extra_config: null },
        { provider: "stripe", created_at: new Date(Date.now() - 25 * 86400000).toISOString(), extra_config: null },
        { provider: "supabase", created_at: new Date(Date.now() - 20 * 86400000).toISOString(), extra_config: null },
        { provider: "anthropic", created_at: new Date(Date.now() - 15 * 86400000).toISOString(), extra_config: null },
        { provider: "vercel", created_at: new Date(Date.now() - 10 * 86400000).toISOString(), extra_config: null },
        { provider: "resend", created_at: new Date(Date.now() - 5 * 86400000).toISOString(), extra_config: null },
        { provider: "twilio", created_at: new Date(Date.now() - 3 * 86400000).toISOString(), extra_config: null },
        { provider: "domains", created_at: new Date(Date.now() - 2 * 86400000).toISOString(), extra_config: { domains: ["example.com", "api.example.com", "expiring-soon.com"] } },
      ],
      githubConnected: true,
    });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Return provider names + metadata only — never the encrypted keys
  const { data } = await supabase
    .from("user_api_keys")
    .select("provider, created_at, extra_config")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  // Also check if GitHub token is stored
  const service = (await import("@/lib/supabase/service")).createServiceClient();
  const { data: ghToken } = await service
    .from("user_github_tokens")
    .select("updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    integrations: data ?? [],
    githubConnected: !!ghToken,
  });
}
