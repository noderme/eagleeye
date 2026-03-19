import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: ghRow } = await service
    .from("user_github_tokens")
    .select("ciphertext, iv")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ghRow) {
    return NextResponse.json({ error: "GitHub not connected" }, { status: 404 });
  }

  const token = decrypt(ghRow.ciphertext, ghRow.iv);

  const res = await fetch(
    "https://api.github.com/user/repos?sort=updated&per_page=100&visibility=all",
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );

  const scopes = res.headers.get("x-oauth-scopes") ?? "(none — may be GitHub App token)";

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json(
      { error: `GitHub API error: ${res.status}`, scopes, body },
      { status: res.status }
    );
  }

  const repos = await res.json();

  // If empty, also return scopes so client can show a useful message
  if (repos.length === 0) {
    return NextResponse.json({ repos, scopes });
  }

  return NextResponse.json({ repos });
}
