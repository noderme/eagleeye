import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";
import { runAllProvidersDynamic, type Credentials } from "@/lib/providers-dynamic";
import { fetchAllRepoInsights, type RepoSummary } from "@/lib/github";
import { runAnalysis, type LLMKey } from "@/lib/analyze";
import { MOCK_MODE_ENABLED } from "@/lib/config";
import { getMockScanResult } from "@/lib/mock-scan";

export const maxDuration = 300; // 5 min — needed for Claude + GitHub in production

const HISTORY_SCANS = 7;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (MOCK_MODE_ENABLED) {
    console.log("[Eagle Eye] Mock mode: returning mock scan trigger results");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const mockResult = getMockScanResult();
    return NextResponse.json({ result: mockResult });
  }

  try {

    const service = createServiceClient();

    // Rate limit: one scan per 60 seconds per user
    const { data: lastScan } = await service
      .from("scan_results")
      .select("scanned_at")
      .eq("user_id", user.id)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastScan) {
      const secondsAgo = (Date.now() - new Date(lastScan.scanned_at).getTime()) / 1000;
      if (secondsAgo < 60) {
        return NextResponse.json(
          { error: `Please wait ${Math.ceil(60 - secondsAgo)} seconds before scanning again` },
          { status: 429 }
        );
      }
    }

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

    // Validate that we have at least GitHub token or provider credentials
    if (!githubToken && repos.length === 0) {
      return NextResponse.json(
        { error: "No GitHub token or repositories configured" },
        { status: 400 }
      );
    }

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

    // Collect all LLM keys first, then pick by priority below
    const llmKeys: Partial<Record<string, LLMKey>> = {};

    for (const row of keyRows ?? []) {
      const value = JSON.parse(decrypt(row.ciphertext, row.iv));
      if (row.provider === "llm_openai") {
        llmKeys.openai = { provider: "openai", apiKey: value.key };
      } else if (row.provider === "llm_anthropic") {
        llmKeys.anthropic = { provider: "anthropic", apiKey: value.key };
      } else if (row.provider === "llm_gemini") {
        llmKeys.gemini = { provider: "gemini", apiKey: value.key };
      } else if (row.provider === "llm_ollama") {
        const ollamaUrl = value.key?.trim() || "http://localhost:11434";
        llmKeys.ollama = { provider: "ollama", apiKey: "ollama", baseURL: ollamaUrl };
      } else if (row.provider === "domains") {
        domains.push(...(row.extra_config?.domains ?? []));
      } else {
        credentials[row.provider] = value;
        keyMeta[row.provider] = row.extra_config ?? null;
      }
    }

    // Pick LLM key by priority: Ollama > Anthropic > OpenAI > Gemini
    // This respects the user's explicit choice — self-hosted (Ollama) always wins
    const llmKey: LLMKey | undefined =
      llmKeys.ollama ?? llmKeys.anthropic ?? llmKeys.openai ?? llmKeys.gemini;

    // Fetch all data in parallel
    const [githubInsights, { providers, domains: domainResults }] = await Promise.all([
      githubToken && repos.length > 0
        ? fetchAllRepoInsights(repos, githubToken)
        : Promise.resolve([]),
      runAllProvidersDynamic(credentials, domains, llmKey),
    ]);

    // Run LLM analysis — requires user-provided LLM key
    let analysis = null;
    let scanError = null;
    if (!llmKey) {
      scanError = "NO_LLM_KEY";
      console.warn("[Eagle Eye] No LLM key configured — skipping analysis");
    } else {
      try {
        analysis = await runAnalysis(githubInsights, providers, domainResults, historyRows ?? [], keyMeta, llmKey);
      } catch (err) {
        scanError = String(err);
        console.error("[Eagle Eye] Analysis error:", err);
      }
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
  } catch (err) {
    console.error("[Eagle Eye] Scan trigger error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
