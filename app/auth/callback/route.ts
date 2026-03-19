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
      } catch {
        // Non-fatal — user can still proceed, background jobs just won't have the token
      }
    }
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
