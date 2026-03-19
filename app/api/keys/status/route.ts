import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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
