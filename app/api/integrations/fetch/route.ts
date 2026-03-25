import { NextRequest, NextResponse } from "next/server";
import { MOCK_MODE_ENABLED } from "@/lib/config";
import { runAllProvidersDynamic, type Credentials } from "@/lib/providers-dynamic";
import { discoverAndRegisterServices } from "@/lib/dynamic-providers";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // Auth guard — skip in mock mode only
  if (!MOCK_MODE_ENABLED) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { credentials, detectedProviders = [], llmKey } = await req.json();

    // Validate credentials object
    if (!credentials || typeof credentials !== "object") {
      return NextResponse.json(
        { error: "Invalid credentials object" },
        { status: 400 }
      );
    }

    // Discover and register any unknown providers from the detected list
    if (detectedProviders.length > 0) {
      await discoverAndRegisterServices(detectedProviders);
    }

    // Extract domains if present
    const domains = credentials.domains || [];
    delete credentials.domains;

    // All providers go through the same LLM discovery pipeline
    const { providers, domains: domainResults } = await runAllProvidersDynamic(
      credentials as Credentials,
      domains,
      llmKey
    );

    return NextResponse.json({
      providers,
      domains: domainResults,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Eagle Eye] Error fetching integrations:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
