import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MOCK_MODE_ENABLED } from "@/lib/config";
import { getMockScanResult } from "@/lib/mock-scan";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (MOCK_MODE_ENABLED) {
    console.log("[Eagle Eye] Mock mode: returning mock scan results");
    return NextResponse.json({ result: getMockScanResult() });
  }

  const { data } = await supabase
    .from("scan_results")
    .select("*")
    .eq("user_id", user.id)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ result: data ?? null });
}
