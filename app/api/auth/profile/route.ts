import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    email: user.email ?? "",
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Unknown",
    avatarUrl: user.user_metadata?.avatar_url ?? null,
    provider: user.app_metadata?.provider ?? "unknown",
  });
}
