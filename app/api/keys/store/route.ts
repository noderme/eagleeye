import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt } from "@/lib/crypto";
import {
  fetchOpenAI,
  fetchAnthropic,
  fetchSupabase,
  fetchStripe,
  fetchVercel,
  fetchResend,
  fetchTwilio,
} from "@/lib/providers";

// Lightweight validators — same fetchers, just check for error field
async function validate(provider: string, credentials: Record<string, string>): Promise<{ valid: boolean; error: string | null }> {
  try {
    let result: any;
    switch (provider) {
      case "openai":    result = await fetchOpenAI(credentials.key); break;
      case "anthropic": result = await fetchAnthropic(credentials.key); break;
      case "supabase":  result = await fetchSupabase(credentials.accessToken); break;
      case "stripe":    result = await fetchStripe(credentials.key); break;
      case "vercel":    result = await fetchVercel(credentials.key); break;
      case "resend":    result = await fetchResend(credentials.key); break;
      case "twilio":    result = await fetchTwilio(credentials.accountSid, credentials.authToken); break;
      default:          return { valid: true, error: null }; // unknown — skip validation
    }
    return { valid: !result.error, error: result.error ?? null };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider, credentials, extraConfig } = await req.json();
  if (!provider || !credentials) {
    return NextResponse.json({ error: "provider and credentials required" }, { status: 400 });
  }

  // Validate the key before saving
  const { valid, error: validationError } = await validate(provider, credentials);
  if (!valid) {
    return NextResponse.json(
      { error: validationError ?? "Invalid credentials — the key was rejected by the provider API." },
      { status: 422 }
    );
  }

  const { ciphertext, iv } = encrypt(JSON.stringify(credentials));
  const service = createServiceClient();

  const { error } = await service.from("user_api_keys").upsert(
    {
      user_id: user.id,
      provider,
      ciphertext,
      iv,
      extra_config: extraConfig ?? {},
      revoked_at: null,
    },
    { onConflict: "user_id,provider" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
