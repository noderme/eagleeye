import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encrypt } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { providerToken } = await req.json();
  if (!providerToken) return NextResponse.json({ error: "providerToken required" }, { status: 400 });

  const { ciphertext, iv } = encrypt(providerToken);
  const service = createServiceClient();
  await service.from("user_github_tokens").upsert(
    { user_id: user.id, ciphertext, iv, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ success: true });
}
