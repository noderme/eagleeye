import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MOCK_MODE_ENABLED } from "@/lib/config";

export async function GET() {
  // In mock mode, return mock detected providers without requiring authentication
  if (MOCK_MODE_ENABLED) {
    console.log("[Eagle Eye] Mock mode: returning mock detected providers");
    return NextResponse.json({
      detected: ["openai", "stripe", "supabase", "vercel", "resend", "twilio", "anthropic"],
      scannedAt: new Date().toISOString(),
    });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get latest scan result and extract detected providers from all repos
  const { data } = await supabase
    .from("scan_results")
    .select("github_data, scanned_at")
    .eq("user_id", user.id)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.github_data) return NextResponse.json({ detected: [], scannedAt: null });

  // Collect unique detected providers across all repos
  const detected = new Set<string>();
  for (const insight of data.github_data as any[]) {
    for (const p of insight.detectedProviders ?? []) {
      detected.add(p);
    }
  }

  return NextResponse.json({ detected: Array.from(detected), scannedAt: data.scanned_at });
}
