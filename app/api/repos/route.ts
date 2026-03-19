import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

interface RepoPayload {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  language: string | null;
  description: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { repos }: { repos: RepoPayload[] } = await req.json();
  if (!Array.isArray(repos) || repos.length === 0) {
    return NextResponse.json({ error: "repos array required" }, { status: 400 });
  }

  const service = createServiceClient();

  // Delete existing repos for user and re-insert selected ones
  await service.from("user_repos").delete().eq("user_id", user.id);

  const rows = repos.map(r => ({
    user_id: user.id,
    repo_id: r.id,
    full_name: r.full_name,
    name: r.name,
    private: r.private,
    language: r.language,
    description: r.description,
  }));

  const { error } = await service.from("user_repos").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: rows.length });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("user_repos")
    .select("repo_id, full_name, name, private, language, description")
    .eq("user_id", user.id);

  return NextResponse.json({ repos: data ?? [] });
}
