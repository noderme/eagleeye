import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Lazy-initialize to avoid crash when ANTHROPIC_API_KEY is not set
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export async function POST(req: NextRequest) {
  try {
    const { integrations } = await req.json();

    const stream = getClient().messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 8096,
      thinking: { type: "adaptive" },
      system: `You are Eagle Eye, an AI dev infrastructure intelligence system. You have deep knowledge of every major developer tool and SaaS platform.

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

Return ONLY a valid JSON object (no markdown, no code fences, no explanation):
{
  "summary": "1 sentence overall infrastructure health assessment with the most critical issue",
  "totalMonthlySpendUsd": number or null,
  "potentialMonthlySavingsUsd": number or null,
  "recommendations": [
    {
      "id": "unique-kebab-case-id",
      "provider": "github | openai | stripe | vercel | resend | twilio | domains | general",
      "category": "spending | plan | security | expiry | quota | ci | billing | saving",
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

Severity priority: critical first, then warning, then saving, then info. Max 12 recommendations. Focus on highest impact.`,
      messages: [
        {
          role: "user",
          content: `Analyze this dev infrastructure data and generate recommendations:\n\n${JSON.stringify(integrations, null, 2)}`,
        },
      ],
    });

    const message = await stream.finalMessage();

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text response from Claude" }, { status: 500 });
    }

    // Strip any accidental markdown fences
    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse Claude response as JSON" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
