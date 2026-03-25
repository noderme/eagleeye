import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt } from "@/lib/crypto";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    // Capture the GitHub OAuth token while it's available in the session.
    // After this redirect it won't be accessible again without re-auth.
    const providerToken = data.session?.provider_token;
    const userId = data.session?.user?.id;

    if (providerToken && userId) {
      try {
        const { ciphertext, iv } = encrypt(providerToken);
        const service = createServiceClient();
        await service.from("user_github_tokens").upsert(
          { user_id: userId, ciphertext, iv, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

        // Check if user has already completed onboarding by seeing if they have
        // any saved repos — if yes, send them to dashboard instead of onboarding
        const { data: repos } = await service
          .from("user_repos")
          .select("id")
          .eq("user_id", userId)
          .limit(1);

        const hasCompletedOnboarding = repos && repos.length > 0;
        const redirectTo = hasCompletedOnboarding ? "/dashboard" : "/onboarding";
        return NextResponse.redirect(`${origin}${redirectTo}`);
      } catch {
        // Non-fatal — fall through to onboarding as safe default
      }
    }
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
