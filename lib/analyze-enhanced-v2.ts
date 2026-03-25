// Enhanced analysis module with support for both Claude and local models
// This module provides intelligent cross-provider analysis with extended thinking

import Anthropic from "@anthropic-ai/sdk";
import { MOCK_MODE_ENABLED } from "./config";
import { analyzeWithLocalModel } from "./analyze-local";

const USE_LOCAL_MODEL = process.env.NEXT_PUBLIC_USE_LOCAL_MODEL === "true";

export interface AnalysisResult {
  summary: string;
  totalMonthlySpendUsd: number | null;
  potentialMonthlySavingsUsd: number | null;
  recommendations: Recommendation[];
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
}

const ENHANCED_ANALYSIS_PROMPT = `You are Eagle Eye, an AI dev infrastructure intelligence system. You have deep knowledge of every major developer tool and SaaS platform.

Analyze ALL provided integration data across EVERY dimension below. Be specific — reference actual names, numbers, amounts, and dates from the data.

DIMENSIONS TO ANALYZE (cover all that have data):
1. SPENDING — Total monthly spend. Is usage justified? Where is money wasted?
2. PLAN FIT — Is each service on the right tier? Flag upgrades (approaching limits) and downgrades (paying for unused capacity). Know each provider's plans and what features each tier includes.
3. KEY & TOKEN ROTATION — Any API keys, OAuth tokens, or secrets approaching expiry or that haven't been rotated in 90+ days
4. DOMAIN EXPIRY — Domains expiring within 90 days are critical. Within 180 days is a warning. Include renewal costs if known.
5. SECURITY — Credentials committed to repos, insecure configs, risky files, exposed secrets
6. QUOTA & LIMITS — Services approaching usage limits that could cause production outages (email quotas, API rate limits, storage)
7. CI/CD HEALTH — Failing pipelines, long-running jobs, no CI on active repos
8. BILLING CYCLES — Subscriptions renewing soon, trial expirations, payment method issues
9. COST SAVINGS — Idle resources, unused features, cheaper alternatives, reserved pricing
10. CROSS-PROVIDER SIGNALS — Correlate signals across multiple providers:
    - If Supabase quota is full AND OpenAI key is expiring AND no CI/CD = compound risk
    - If multiple services renewing same day = consolidate payment method
    - If high spend on one service + low usage on another = potential migration opportunity

Think step by step. Use extended thinking to reason through complex cross-provider correlations. Consider business impact, not just severity.

Return ONLY a valid JSON object (no markdown, no code fences, no explanation):
{
  "summary": "1 sentence overall infrastructure health assessment with the most critical issue",
  "totalMonthlySpendUsd": number or null,
  "potentialMonthlySavingsUsd": number or null,
  "recommendations": [
    {
      "id": "unique-kebab-case-id",
      "provider": "github | openai | stripe | vercel | resend | twilio | domains | general",
      "category": "spending | plan | security | expiry | quota | ci | billing | saving | cross-provider",
      "severity": "critical | warning | info | saving",
      "title": "max 7 words, punchy",
      "description": "2-3 sentences. Specific data: actual repo names, dollar amounts, dates, percentages.",
      "action": "Exact actionable step. Start with a verb.",
      "saving": "$X/mo if quantifiable, otherwise null",
      "deadline": "ISO date if time-sensitive (expiry, renewal), otherwise null",
      "icon": "single emoji"
    }
  ]
}

Severity priority: critical first, then warning, then saving, then info. Max 12 recommendations. Focus on highest impact.`;

/**
 * Run analysis using either Claude (production) or local model (testing)
 */
export async function runAnalysis(
  githubInsights: any[],
  providers: Record<string, any>,
  domainResults: any[],
  scanHistory: any[],
  keyMeta: Record<string, any>
): Promise<AnalysisResult> {
  const integrations = {
    github_data: githubInsights,
    providers,
    domains: domainResults,
    scan_history: scanHistory,
    key_metadata: keyMeta,
  };

  // Use local model for testing or mock mode
  if (USE_LOCAL_MODEL || MOCK_MODE_ENABLED) {
    console.log("[Eagle Eye] Using local model for analysis");
    return analyzeWithLocalModel(integrations);
  }

  // Use Claude for production
  console.log("[Eagle Eye] Using Claude for analysis");
  return runAnalysisWithClaude(integrations);
}

/**
 * Run analysis using Claude with extended thinking
 */
async function runAnalysisWithClaude(integrations: any): Promise<AnalysisResult> {
  const client = new Anthropic();

  try {
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 16000,
      thinking: {
        type: "enabled",
        budget_tokens: 10000, // Extended thinking budget for complex analysis
      },
      messages: [
        {
          role: "user",
          content: `${ENHANCED_ANALYSIS_PROMPT}\n\nAnalyze this dev infrastructure data and generate recommendations:\n\n${JSON.stringify(integrations, null, 2)}`,
        },
      ],
    });

    // Extract text from response
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Parse JSON response
    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse Claude response as JSON");
    }

    const result = JSON.parse(jsonMatch[0]);
    return result as AnalysisResult;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("[Eagle Eye] Claude API error:", err.message);
      throw err;
    }
    throw err;
  }
}

/**
 * Format analysis result for display
 */
export function formatAnalysisForDisplay(analysis: AnalysisResult): string {
  let output = `# Infrastructure Analysis\n\n`;
  output += `**Summary:** ${analysis.summary}\n\n`;

  if (analysis.totalMonthlySpendUsd) {
    output += `**Total Monthly Spend:** $${analysis.totalMonthlySpendUsd.toFixed(2)}\n`;
  }

  if (analysis.potentialMonthlySavingsUsd) {
    output += `**Potential Monthly Savings:** $${analysis.potentialMonthlySavingsUsd.toFixed(2)}\n`;
  }

  output += `\n## Recommendations (${analysis.recommendations.length})\n\n`;

  for (const rec of analysis.recommendations) {
    output += `### ${rec.icon} ${rec.title}\n`;
    output += `**Provider:** ${rec.provider} | **Severity:** ${rec.severity}\n`;
    output += `${rec.description}\n\n`;
    output += `**Action:** ${rec.action}\n`;
    if (rec.saving) output += `**Potential Saving:** ${rec.saving}\n`;
    if (rec.deadline) output += `**Deadline:** ${new Date(rec.deadline).toLocaleDateString()}\n`;
    output += `\n`;
  }

  return output;
}
