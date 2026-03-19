import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";
import { runAllProviders, type Credentials } from "@/lib/providers";
import { fetchAllRepoInsights, type RepoSummary } from "@/lib/github";
import { runAnalysis } from "@/lib/analyze";

export const maxDuration = 300; // 5 min — needed for Claude + GitHub in production

const HISTORY_SCANS = 7;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();

  // Get GitHub token
  const { data: ghRow } = await service
    .from("user_github_tokens")
    .select("ciphertext, iv")
    .eq("user_id", user.id)
    .maybeSingle();

  const githubToken = ghRow ? decrypt(ghRow.ciphertext, ghRow.iv) : null;

  // Get selected repos
  const { data: repoRows } = await service
    .from("user_repos")
    .select("repo_id, full_name, name, private, language, description")
    .eq("user_id", user.id);

  const repos: RepoSummary[] = (repoRows ?? []).map(r => ({
    id: r.repo_id,
    full_name: r.full_name,
    name: r.name,
    private: r.private,
    language: r.language,
    description: r.description,
  }));

  // Get provider API keys + scan history
  const [{ data: keyRows }, { data: historyRows }] = await Promise.all([
    service
      .from("user_api_keys")
      .select("provider, ciphertext, iv, extra_config")
      .eq("user_id", user.id)
      .is("revoked_at", null),
    service
      .from("scan_results")
      .select("provider_data, domain_data, scanned_at")
      .eq("user_id", user.id)
      .order("scanned_at", { ascending: false })
      .limit(HISTORY_SCANS),
  ]);

  const credentials: Credentials = {};
  const domains: string[] = [];
  const keyMeta: Record<string, Record<string, any> | null> = {};

  for (const row of keyRows ?? []) {
    const value = JSON.parse(decrypt(row.ciphertext, row.iv));
    if (row.provider === "domains") {
      domains.push(...(row.extra_config?.domains ?? []));
    } else {
      credentials[row.provider] = value;
      keyMeta[row.provider] = row.extra_config ?? null;
    }
  }

  // Fetch all data in parallel
  const [githubInsights, { providers, domains: domainResults }] = await Promise.all([
    githubToken && repos.length > 0
      ? fetchAllRepoInsights(repos, githubToken)
      : Promise.resolve([]),
    runAllProviders(credentials, domains),
  ]);

  // Run Claude analysis
  let analysis = null;
  let scanError = null;
  try {
    analysis = await runAnalysis(githubInsights, providers, domainResults, historyRows ?? [], keyMeta);
  } catch (err) {
    scanError = String(err);
  }

  // Return without saving — caller decides whether to persist
  return NextResponse.json({
    result: {
      scanned_at: new Date().toISOString(),
      github_data: githubInsights,
      provider_data: providers,
      domain_data: domainResults,
      analysis,
      error: scanError,
    },
  });
}
