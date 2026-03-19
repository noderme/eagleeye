import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { result } = await req.json();
  if (!result) return NextResponse.json({ error: "result required" }, { status: 400 });

  const service = createServiceClient();
  const { data: saved, error } = await service
    .from("scan_results")
    .insert({
      user_id: user.id,
      scanned_at: result.scanned_at ?? new Date().toISOString(),
      github_data: result.github_data,
      provider_data: result.provider_data,
      domain_data: result.domain_data,
      analysis: result.analysis,
      error: result.error,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: saved });
}
