import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt } from "@/lib/crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  fetchOpenAI,
  fetchAnthropic,
  fetchSupabase,
  fetchStripe,
  fetchVercel,
  fetchResend,
  fetchTwilio,
} from "@/lib/providers";

// Validate an LLM key with a minimal inference call
async function validateLLMKey(provider: string, apiKey: string): Promise<{ valid: boolean; error: string | null }> {
  try {
    if (provider === "llm_openai") {
      const client = new OpenAI({ apiKey, timeout: 15_000 });
      await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
      return { valid: true, error: null };
    }
    if (provider === "llm_anthropic") {
      const client = new Anthropic({ apiKey, timeout: 15_000 });
      await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
      return { valid: true, error: null };
    }
    if (provider === "llm_gemini") {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      await model.generateContent({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
      return { valid: true, error: null };
    }
    return { valid: true, error: null };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    // Surface friendly errors for common auth failures
    if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("invalid_api_key") || msg.includes("API key")) {
      return { valid: false, error: "Invalid API key — check the key and try again." };
    }
    return { valid: false, error: msg };
  }
}

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
      case "llm_openai":
      case "llm_anthropic":
      case "llm_gemini":   return validateLLMKey(provider, credentials.key);
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
