import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createServiceClient } from "@/lib/supabase/service";
import { decrypt } from "@/lib/crypto";
import { runAllProviders, type Credentials } from "@/lib/providers";
import { fetchAllRepoInsights, type RepoSummary } from "@/lib/github";
import { runAnalysis } from "@/lib/analyze";

const HISTORY_SCANS = 7;         // how many past scans to pass to Claude
const MIN_SCAN_GAP_SECONDS = 600; // idempotency: skip if scanned within 10 min

// ── QStash signature verification ───────────────────────────────────────────

async function verifyQStash(req: NextRequest, bodyText: string): Promise<boolean> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) return false;

  const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
  const signature = req.headers.get("upstash-signature") ?? "";

  try {
    return await receiver.verify({ signature, body: bodyText });
  } catch {
    return false;
  }
}

// ── Queue next scan for a specific user ─────────────────────────────────────

async function scheduleNextScan(userId: string, delaySeconds: number) {
  const token = process.env.QSTASH_TOKEN;
  const qstashUrl = process.env.QSTASH_URL ?? "https://qstash.upstash.io";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;

  if (!token || !appUrl) return; // skip if not configured

  const destination = `${appUrl.startsWith("http") ? appUrl : `https://${appUrl}`}/api/jobs/scan`;

  await fetch(`${qstashUrl}/v2/publish/${encodeURIComponent(destination)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Upstash-Delay": `${delaySeconds}s`,
    },
    body: JSON.stringify({ userId }),
  });
}

// ── Scan a single user ───────────────────────────────────────────────────────

async function scanUser(userId: string, service: ReturnType<typeof createServiceClient>) {
  // Idempotency: skip if scanned recently
  const { data: latest } = await service
    .from("scan_results")
    .select("scanned_at")
    .eq("user_id", userId)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.scanned_at) {
    const age = (Date.now() - new Date(latest.scanned_at).getTime()) / 1000;
    if (age < MIN_SCAN_GAP_SECONDS) {
      return { skipped: true, nextScanIn: null };
    }
  }

  // Fetch data in parallel
  const [ghRow, repoRows, keyRows, historyRows] = await Promise.all([
    service.from("user_github_tokens").select("ciphertext, iv").eq("user_id", userId).maybeSingle(),
    service.from("user_repos").select("repo_id, full_name, name, private, language, description").eq("user_id", userId),
    service.from("user_api_keys").select("provider, ciphertext, iv, extra_config").eq("user_id", userId).is("revoked_at", null),
    service.from("scan_results")
      .select("provider_data, domain_data, scanned_at")
      .eq("user_id", userId)
      .order("scanned_at", { ascending: false })
      .limit(HISTORY_SCANS),
  ]);

  const githubToken = ghRow.data ? decrypt(ghRow.data.ciphertext, ghRow.data.iv) : null;

  const repos: RepoSummary[] = (repoRows.data ?? []).map(r => ({
    id: r.repo_id,
    full_name: r.full_name,
    name: r.name,
    private: r.private,
    language: r.language,
    description: r.description,
  }));

  const credentials: Credentials = {};
  const domains: string[] = [];
  const keyMeta: Record<string, Record<string, any> | null> = {};

  for (const row of keyRows.data ?? []) {
    const value = JSON.parse(decrypt(row.ciphertext, row.iv));
    if (row.provider === "domains") {
      domains.push(...(row.extra_config?.domains ?? []));
    } else {
      (credentials as any)[row.provider] = value;
      keyMeta[row.provider] = row.extra_config ?? null;
    }
  }

  const [githubInsights, { providers, domains: domainResults }] = await Promise.all([
    githubToken && repos.length > 0 ? fetchAllRepoInsights(repos, githubToken) : Promise.resolve([]),
    runAllProviders(credentials, domains),
  ]);

  let analysis = null;
  let scanError = null;
  let nextScanIn = 86400; // fallback: 24h

  try {
    analysis = await runAnalysis(githubInsights, providers, domainResults, historyRows.data ?? [], keyMeta);
    nextScanIn = analysis.nextScanIn;
  } catch (err) {
    scanError = String(err);
    nextScanIn = 3600; // on error, retry in 1 hour
  }

  await service.from("scan_results").insert({
    user_id: userId,
    github_data: githubInsights,
    provider_data: providers,
    domain_data: domainResults,
    analysis,
    error: scanError,
  });

  return { skipped: false, nextScanIn };
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  const valid = await verifyQStash(req, bodyText);
  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  let body: { userId?: string } = {};
  try { body = JSON.parse(bodyText); } catch { /* cron trigger with no body */ }

  // Single-user scan (self-scheduled)
  if (body.userId) {
    let nextScanIn = 86400;
    try {
      const result = await scanUser(body.userId, service);
      nextScanIn = result.nextScanIn ?? 86400;
      if (result.skipped) {
        return NextResponse.json({ skipped: true, userId: body.userId });
      }
    } finally {
      // Always schedule next scan — even on failure
      await scheduleNextScan(body.userId, nextScanIn);
    }
    return NextResponse.json({ scanned: 1, userId: body.userId, nextScanIn });
  }

  // All-users scan (fallback cron — catches broken chains)
  const { data: users } = await service.from("user_github_tokens").select("user_id");
  const userIds = (users ?? []).map(u => u.user_id);

  const results: Record<string, string> = {};
  for (const userId of userIds) {
    let nextScanIn = 86400;
    try {
      const result = await scanUser(userId, service);
      nextScanIn = result.nextScanIn ?? 86400;
      results[userId] = result.skipped ? "skipped" : "ok";
    } catch (err) {
      results[userId] = String(err);
      nextScanIn = 3600;
    } finally {
      await scheduleNextScan(userId, nextScanIn);
    }
  }

  return NextResponse.json({ scanned: userIds.length, results });
}
