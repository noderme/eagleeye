import Anthropic from "@anthropic-ai/sdk";
import type { RepoInsight } from "./github";
import { summarizeGitHub } from "./summarize/github";
import { summarizeOpenAI } from "./summarize/openai";
import { summarizeStripe } from "./summarize/stripe";
import { summarizeVercel } from "./summarize/vercel";
import { summarizeResend } from "./summarize/resend";
import { summarizeTwilio } from "./summarize/twilio";
import { summarizeDomains, minDomainDaysLeft } from "./summarize/domains";
import { summarizeKeyExpiry, minKeyExpiryDays } from "./summarize/keymeta";

const client = new Anthropic({ timeout: 90_000 }); // 90s — adaptive thinking can be slow

export interface Recommendation {
  id: string;
  provider: string;
  category: string;
  severity: "critical" | "warning" | "info" | "saving";
  title: string;
  description: string;
  action: string;
  saving: string | null;
  deadline: string | null;
  icon: string;
  planAdvice?: "upgrade" | "downgrade" | "stay";
}

export interface AnalysisResult {
  summary: string;
  totalMonthlySpendUsd: number | null;
  potentialMonthlySavingsUsd: number | null;
  nextScanIn: number;       // seconds until next scan
  nextScanReason: string;   // why Claude chose this interval
  recommendations: Recommendation[];
}

// ── Safety floor — computed from raw data, overrides Claude if needed ────────

function computeSafetyFloor(
  providers: Record<string, any>,
  domains: any[],
  keyMeta: Record<string, Record<string, any> | null>
): number {
  let floor = 86400; // default: 24 hours

  // Domain expiry urgency
  const minDomainDays = minDomainDaysLeft(domains);
  if (minDomainDays != null) {
    if (minDomainDays <= 7)  floor = Math.min(floor, 3600);
    else if (minDomainDays <= 30) floor = Math.min(floor, 21600);
  }

  // API key expiry urgency
  const minKeyDays = minKeyExpiryDays(keyMeta);
  if (minKeyDays != null) {
    if (minKeyDays <= 7)  floor = Math.min(floor, 3600);
    else if (minKeyDays <= 30) floor = Math.min(floor, 21600);
  }

  // OpenAI quota exhaustion
  const openai = providers.openai;
  if (openai && !openai.error && openai.monthlySpendUsd && openai.hardLimitUsd) {
    const pct = openai.monthlySpendUsd / openai.hardLimitUsd;
    if (pct >= 0.9)  floor = Math.min(floor, 3600);
    else if (pct >= 0.8) floor = Math.min(floor, 7200);
    else if (pct >= 0.7) floor = Math.min(floor, 14400);
  }

  // Stripe renewal within 7 days
  const stripe = providers.stripe;
  if (stripe && !stripe.error) {
    const urgent = (stripe.subscriptions ?? []).some((s: any) => s.daysUntilRenewal <= 7);
    if (urgent) floor = Math.min(floor, 21600);
  }

  return floor;
}

// ── Main analysis ────────────────────────────────────────────────────────────

export async function runAnalysis(
  githubInsights: RepoInsight[],
  providers: Record<string, any>,
  domains: any[],
  history: any[] = [],
  keyMeta: Record<string, Record<string, any> | null> = {}
): Promise<AnalysisResult> {

  // Build key expiry lines for all providers that have expiry set
  const keyExpiryLines = Object.entries(keyMeta)
    .map(([provider, meta]) => summarizeKeyExpiry(provider, meta))
    .filter(Boolean);

  // Known provider summarizers
  const knownSummarizers: Record<string, () => string> = {
    openai: () => summarizeOpenAI(providers.openai, history),
    stripe: () => summarizeStripe(providers.stripe),
    vercel: () => summarizeVercel(providers.vercel),
    resend: () => summarizeResend(providers.resend),
    twilio: () => summarizeTwilio(providers.twilio),
  };

  // Build sections: known providers via summarizers, unknown providers via their _summary/_signal
  const providerSections: string[] = [];
  for (const [id, data] of Object.entries(providers)) {
    if (!data || data.error) continue;
    if (knownSummarizers[id]) {
      const s = knownSummarizers[id]();
      if (s) providerSections.push(s);
    } else {
      // Unknown provider — use the summary/signal Claude produced at fetch time
      const name = id.charAt(0).toUpperCase() + id.slice(1);
      const summary = data._summary ?? data.plan ?? data.status ?? "connected";
      const signal  = data._signal ?? "";
      providerSections.push(`${name}: ${summary}${signal ? `. ${signal}` : ""}`);
    }
  }

  // Build clean narrative context for Claude — history used for trend computation
  const sections = [
    summarizeGitHub(githubInsights),
    ...providerSections,
    summarizeDomains(domains),
    keyExpiryLines.length > 0 ? `API Key Expiry:\n${keyExpiryLines.map(l => `  ${l}`).join("\n")}` : "",
  ].filter(Boolean);

  const context = sections.join("\n\n");

  const stream = client.messages.stream({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8096,
    thinking: { type: "adaptive" },
    system: `You are Eagle Eye, an AI dev infrastructure intelligence system.
Your job: make decisions, not suggestions. The user hired you so they don't have to think about infrastructure.

RULES:
- Never say "consider", "you might", "if you anticipate", "depending on your needs", or any hedge.
- Every recommendation ends with a single concrete action the user should take RIGHT NOW.
- For plan fit: pick one verdict — upgrade, downgrade, or stay — and justify it with the actual numbers given.
- If you don't have enough usage data to make a call, say what specific data is missing and where to find it. Do not hedge.
- You are NOT a logging tool. Do NOT flag individual failures, payment bounces, or one-off errors.
- You WILL receive pre-computed signals (trends, projections, days until expiry). Trust these numbers.

Focus on four areas:
1. EXPIRY — domains, API keys, trials, contracts expiring
2. EXHAUSTION — quotas, bandwidth, credits about to run out
3. DRIFT — spend or usage accelerating toward a limit
4. PLAN FIT — pick a verdict using the data you have:
   - Usage well below paid plan limits → downgrade (state exact saving)
   - Usage at or near free tier ceiling → upgrade NOW (state exact risk)
   - Plan matches usage → stay (state why in one sentence with numbers)
   - Data missing to decide → state exactly what metric is missing and where to get it

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "1 sentence: most critical risk right now, or 'Infrastructure healthy' if nothing urgent",
  "totalMonthlySpendUsd": number or null,
  "potentialMonthlySavingsUsd": number or null,
  "nextScanIn": <seconds as integer>,
  "nextScanReason": "<why you chose this interval>",
  "recommendations": [
    {
      "id": "unique-kebab-id",
      "provider": "<provider name or 'general'>",
      "category": "expiry|exhaustion|drift|security|saving|plan-fit",
      "severity": "critical|warning|info|saving",
      "title": "max 7 words",
      "description": "2-3 sentences. State the verdict and the exact numbers that justify it. No hedging.",
      "action": "Single concrete action starting with a verb. No alternatives. No 'or'.",
      "saving": "$X/mo if quantifiable, else null",
      "deadline": "ISO date if time-sensitive, else null",
      "icon": "single emoji",
      "planAdvice": "upgrade|downgrade|stay — only for plan-fit category, omit otherwise"
    }
  ]
}

nextScanIn guidance:
- Something expires in <7 days: 3600 (1 hour)
- Something expires in <30 days OR quota >80%: 21600 (6 hours)
- Noticeable drift or trends: 43200 (12 hours)
- Everything healthy, slow growth: 86400 (24 hours)
- Completely static: 172800 (48 hours)

Sort: critical first, then warning, saving, info. Max 12 total.`,
    messages: [
      {
        role: "user",
        content: `Current infrastructure state:\n\n${context}`,
      },
    ],
  });

  const message = await Promise.race([
    stream.finalMessage(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Claude analysis timed out after 90s")), 90_000)
    ),
  ]);
  const textBlock = message.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse Claude response as JSON");

  const parsed = JSON.parse(jsonMatch[0]) as AnalysisResult;

  // Deduplicate: if a provider already has a warning/critical rec, drop plan-fit info for it
  const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, saving: 1, info: 0 };
  const maxSeverityByProvider: Record<string, number> = {};
  for (const rec of parsed.recommendations) {
    const rank = SEVERITY_RANK[rec.severity] ?? 0;
    const key = rec.provider.toLowerCase();
    maxSeverityByProvider[key] = Math.max(maxSeverityByProvider[key] ?? 0, rank);
  }
  parsed.recommendations = parsed.recommendations.filter(rec => {
    if (rec.category === "plan-fit" && rec.severity === "info") {
      const key = rec.provider.toLowerCase();
      return (maxSeverityByProvider[key] ?? 0) <= SEVERITY_RANK.info;
    }
    return true;
  });

  // Apply safety floor — code always wins over Claude on this
  const floor = computeSafetyFloor(providers, domains, keyMeta);
  parsed.nextScanIn = Math.min(parsed.nextScanIn ?? 86400, floor);

  return parsed;
}
