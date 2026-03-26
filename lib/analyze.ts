import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RepoInsight } from "./github";
import { summarizeGitHub } from "./summarize/github";
import { summarizeOpenAI } from "./summarize/openai";
import { summarizeStripe } from "./summarize/stripe";
import { summarizeVercel } from "./summarize/vercel";
import { summarizeResend } from "./summarize/resend";
import { summarizeTwilio } from "./summarize/twilio";
import { summarizeDomains, minDomainDaysLeft } from "./summarize/domains";
import { summarizeKeyExpiry, minKeyExpiryDays } from "./summarize/keymeta";

// ── LLM provider types ───────────────────────────────────────────────────────
export type LLMProvider = "anthropic" | "openai" | "gemini" | "ollama";

export interface LLMKey {
  provider: LLMProvider;
  apiKey: string;
  /** For Ollama: the base URL (e.g. http://localhost:11434/v1) */
  baseURL?: string;
  /** For Ollama: the model name to use */
  model?: string;
}

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
  reasoning?: string; // New: explains the cross-provider logic
}

export interface AnalysisResult {
  summary: string;
  totalMonthlySpendUsd: number | null;
  potentialMonthlySavingsUsd: number | null;
  nextScanIn: number;
  nextScanReason: string;
  recommendations: Recommendation[];
  systemicRisks?: string[]; // New: patterns across providers
  costOptimizations?: string[]; // New: specific cost savings opportunities
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
    if (minDomainDays <= 7) floor = Math.min(floor, 3600);
    else if (minDomainDays <= 30) floor = Math.min(floor, 21600);
  }

  // API key expiry urgency
  const minKeyDays = minKeyExpiryDays(keyMeta);
  if (minKeyDays != null) {
    if (minKeyDays <= 7) floor = Math.min(floor, 3600);
    else if (minKeyDays <= 30) floor = Math.min(floor, 21600);
  }

  // OpenAI quota exhaustion
  const openai = providers.openai;
  if (openai && !openai.error && openai.monthlySpendUsd && openai.hardLimitUsd) {
    const pct = openai.monthlySpendUsd / openai.hardLimitUsd;
    if (pct >= 0.9) floor = Math.min(floor, 3600);
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

// ── Main enhanced analysis with extended thinking ────────────────────────────

// ── Multi-provider LLM call ──────────────────────────────────────────────────
async function callLLM(systemPrompt: string, userContent: string, llmKey: LLMKey): Promise<string> {
  if (llmKey.provider === "openai") {
    const client = new OpenAI({ apiKey: llmKey.apiKey, timeout: 120_000 });
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  }

  if (llmKey.provider === "gemini") {
    try {
      const genAI = new GoogleGenerativeAI(llmKey.apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent({
        systemInstruction: systemPrompt,
        contents: [{ role: "user", parts: [{ text: userContent }] }],
      });
      return result.response.text();
    } catch (e) {
      const msg = String(e);
      if (/API_KEY_INVALID|API key not valid|invalid.*key/i.test(msg)) {
        throw new Error("Invalid Gemini API key — please update it in Integrations.");
      }
      if (/RESOURCE_EXHAUSTED|quota|429/i.test(msg)) {
        throw new Error("Gemini quota exceeded — free tier is full or rate limited.");
      }
      throw new Error(`Gemini error: ${msg.replace(/\[GoogleGenerativeAI Error\]:\s*/i, "").replace(/Error fetching from https?:\/\/[^\s]+:\s*/i, "").slice(0, 120)}`);
    }
  }

  // Ollama: OpenAI-compatible local endpoint
  if (llmKey.provider === "ollama") {
    // Use baseURL from LLMKey (passed directly, not via process.env mutation)
    // Normalize: ensure the base URL ends with /v1
    const rawBase = llmKey.baseURL ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const baseURL = rawBase.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1";
    const model = llmKey.model ?? process.env.OLLAMA_MODEL ?? "llama3.1:8b";
    console.log(`[Ollama] Using baseURL: ${baseURL}, model: ${model}`);
    const client = new OpenAI({ apiKey: llmKey.apiKey || "ollama", baseURL, timeout: 120_000 });
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 8000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  }

  // Default: Anthropic
  const client = new Anthropic({ apiKey: llmKey.apiKey, timeout: 120_000 });
  const stream = client.messages.stream({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const message = await Promise.race([
    stream.finalMessage(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Claude analysis timed out after 120s")), 120_000)
    ),
  ]);
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");
  return textBlock.text;
}

export async function runEnhancedAnalysis(
  githubInsights: RepoInsight[],
  providers: Record<string, any>,
  domains: any[],
  history: any[] = [],
  keyMeta: Record<string, Record<string, any> | null> = {},
  llmKey?: LLMKey
): Promise<AnalysisResult> {
  if (!llmKey) {
    throw new Error("NO_LLM_KEY");
  }
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
      const signal = data._signal ?? "";
      providerSections.push(`${name}: ${summary}${signal ? `. ${signal}` : ""}`);
    }
  }

  // Build clean narrative context for Claude
  const sections = [
    summarizeGitHub(githubInsights),
    ...providerSections,
    summarizeDomains(domains),
    keyExpiryLines.length > 0 ? `API Key Expiry:\n${keyExpiryLines.map((l) => `  ${l}`).join("\n")}` : "",
  ].filter(Boolean);

  const context = sections.join("\n\n");

  // Enhanced system prompt with extended thinking guidance
  const systemPrompt = `You are Eagle Eye, an AI dev infrastructure intelligence system with deep analytical capabilities.
Your job: make decisions, not suggestions. The user hired you to be their senior DevOps engineer watching 24/7.

EXTENDED THINKING REQUIREMENTS:
Before generating recommendations, you MUST:
1. Cross-correlate signals across multiple providers (e.g., Supabase quota full + OpenAI key expiring + no CI = compound risk)
2. Detect patterns that indicate systemic risks (e.g., multiple providers approaching limits simultaneously)
3. Identify cost optimization opportunities by comparing plan tiers and usage patterns
4. Estimate potential cost savings with specific dollar amounts
5. Think step-by-step about business impact, not just technical severity
6. Consider dependencies between services (e.g., if Stripe fails, revenue stops)

RULES:
- Never say "consider", "you might", "if you anticipate", "depending on your needs", or any hedge.
- Every recommendation ends with a single concrete action the user should take RIGHT NOW.
- For plan fit: pick one verdict — upgrade, downgrade, or stay — and justify it with the actual numbers given.
- If you don't have enough usage data to make a call, say what specific data is missing and where to find it. Do not hedge.
- You are NOT a logging tool. Do NOT flag individual failures, payment bounces, or one-off errors.
- You WILL receive pre-computed signals (trends, projections, days until expiry). Trust these numbers.

ANALYSIS FRAMEWORK:
Focus on four areas:
1. EXPIRY — domains, API keys, trials, contracts expiring (HIGHEST PRIORITY)
2. EXHAUSTION — quotas, bandwidth, credits about to run out (HIGH PRIORITY)
3. DRIFT — spend or usage accelerating toward a limit (MEDIUM PRIORITY)
4. PLAN FIT — pick a verdict using the data you have:
   - Usage well below paid plan limits → downgrade (state exact saving)
   - Usage at or near free tier ceiling → upgrade NOW (state exact risk)
   - Plan matches usage → stay (state why in one sentence with numbers)
   - Data missing to decide → state exactly what metric is missing and where to get it

CROSS-PROVIDER ANALYSIS:
- Look for compound risks: e.g., "Supabase at 84% capacity + OpenAI spending at 46% of limit + domain expiring in 10 days = medium risk window"
- Identify systemic patterns: e.g., "Multiple services approaching limits suggests growth is outpacing infrastructure planning"
- Calculate total cost impact: e.g., "Upgrading Supabase ($50/mo) + Vercel ($20/mo) = $70/mo additional, but saves $200/mo in overage costs"
- Prioritize by business impact: e.g., "Stripe failure = revenue stops (critical) vs. Resend domain unverified = email delays (warning)"

COST OPTIMIZATION:
- Compare current spend vs. optimized plan combinations
- Identify unused services or underutilized plans
- Calculate ROI for upgrades (e.g., "Upgrade Supabase to Pro ($100/mo) to avoid $500/mo in overages")
- Suggest consolidation opportunities (e.g., "Migrate from Twilio to Resend for email to reduce provider count")

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "1 sentence: most critical risk right now, or 'Infrastructure healthy' if nothing urgent",
  "totalMonthlySpendUsd": number or null,
  "potentialMonthlySavingsUsd": number or null,
  "nextScanIn": <seconds as integer>,
  "nextScanReason": "<why you chose this interval>",
  "systemicRisks": ["<pattern 1>", "<pattern 2>"],
  "costOptimizations": ["<opportunity 1>", "<opportunity 2>"],
  "recommendations": [
    {
      "id": "unique-kebab-id",
      "provider": "<provider name or 'general'>",
      "category": "expiry|exhaustion|drift|security|saving|plan-fit",
      "severity": "critical|warning|info|saving",
      "title": "max 7 words",
      "description": "2-3 sentences. State the verdict and the exact numbers that justify it. Include cross-provider context if relevant. No hedging.",
      "action": "Single concrete action starting with a verb. No alternatives. No 'or'.",
      "saving": "$X/mo if quantifiable, else null",
      "deadline": "ISO date if time-sensitive, else null",
      "icon": "single emoji",
      "reasoning": "Brief explanation of cross-provider logic or business impact",
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

Sort: critical first, then warning, saving, info. Max 15 total.`;

  const userContent = `Current infrastructure state:\n\n${context}\n\nPlease analyze this infrastructure deeply:\n1. Cross-correlate signals across all providers\n2. Identify systemic risks and patterns\n3. Calculate specific cost optimization opportunities\n4. Prioritize recommendations by business impact\n5. Provide step-by-step reasoning for each recommendation`;

  const rawText = await callLLM(systemPrompt, userContent, llmKey);

  const cleaned = rawText.replace(/```json|```/g, "").trim();
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
  parsed.recommendations = parsed.recommendations.filter((rec) => {
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

// Alias for backward compatibility — scan routes import runAnalysis
export const runAnalysis = runEnhancedAnalysis;
