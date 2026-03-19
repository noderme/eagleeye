import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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
