// Local model analysis using Ollama/Mistral for testing
// This module provides a drop-in replacement for Claude analysis that uses a local model
// Set NEXT_PUBLIC_USE_LOCAL_MODEL=true to enable local model analysis

import { MOCK_MODE_ENABLED } from "./config";

const LOCAL_MODEL_URL = process.env.LOCAL_MODEL_URL || "http://localhost:11434/api/generate";
const LOCAL_MODEL_NAME = process.env.LOCAL_MODEL_NAME || "mistral";

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

/**
 * Generate analysis using a local model (Ollama/Mistral)
 * This is a mock implementation that returns realistic recommendations
 */
export async function analyzeWithLocalModel(integrations: any): Promise<AnalysisResult> {
  console.log("[Eagle Eye] Using local model for analysis");

  // Extract key metrics from integrations
  const providers = integrations.providers || {};
  const domains = integrations.domains || [];
  const githubData = integrations.github_data || [];

  const recommendations: Recommendation[] = [];

  // Analyze OpenAI
  if (providers.openai) {
    const openai = providers.openai;
    if (openai.monthlySpendUsd && openai.monthlySpendUsd > 100) {
      recommendations.push({
        id: "openai-spend-high",
        provider: "openai",
        category: "spending",
        severity: "warning",
        title: "High OpenAI spending detected",
        description: `Your OpenAI spending is $${openai.monthlySpendUsd.toFixed(2)}/month. Consider optimizing prompts or switching to cheaper models.`,
        action: "Review API usage patterns and optimize prompt efficiency.",
        saving: "$20-50/mo",
        deadline: null,
        icon: "💰",
      });
    }
    if (openai.hardLimitUsd && openai.monthlySpendUsd && openai.monthlySpendUsd > openai.hardLimitUsd * 0.8) {
      recommendations.push({
        id: "openai-limit-approaching",
        provider: "openai",
        category: "quota",
        severity: "critical",
        title: "Approaching OpenAI hard limit",
        description: `Usage is at ${((openai.monthlySpendUsd / openai.hardLimitUsd) * 100).toFixed(0)}% of hard limit ($${openai.hardLimitUsd}).`,
        action: "Increase hard limit or reduce API usage immediately.",
        saving: null,
        deadline: null,
        icon: "⚠️",
      });
    }
  }

  // Analyze Stripe
  if (providers.stripe) {
    const stripe = providers.stripe;
    if (stripe.availableBalance && stripe.availableBalance < 100) {
      recommendations.push({
        id: "stripe-low-balance",
        provider: "stripe",
        category: "billing",
        severity: "warning",
        title: "Low Stripe balance",
        description: `Available balance is only $${stripe.availableBalance.toFixed(2)}.`,
        action: "Top up your Stripe account to avoid payment processing failures.",
        saving: null,
        deadline: null,
        icon: "🏦",
      });
    }
  }

  // Analyze Vercel
  if (providers.vercel) {
    const vercel = providers.vercel;
    if (vercel.plan === "hobby" && vercel.projectCount > 3) {
      recommendations.push({
        id: "vercel-hobby-limit",
        provider: "vercel",
        category: "plan",
        severity: "warning",
        title: "Vercel Hobby plan project limit exceeded",
        description: `You have ${vercel.projectCount} projects but Hobby plan only allows 3.`,
        action: "Upgrade to Pro plan or delete unused projects.",
        saving: null,
        deadline: null,
        icon: "🚀",
      });
    }
  }

  // Analyze Resend
  if (providers.resend) {
    const resend = providers.resend;
    const unverified = resend.domains?.filter((d: any) => d.status !== "verified").length || 0;
    if (unverified > 0) {
      recommendations.push({
        id: "resend-unverified-domains",
        provider: "resend",
        category: "security",
        severity: "warning",
        title: `${unverified} unverified Resend domain(s)`,
        description: `${unverified} domain(s) are not verified, which may affect email deliverability.`,
        action: "Verify all domains through DNS records.",
        saving: null,
        deadline: null,
        icon: "✉️",
      });
    }
  }

  // Analyze Domains
  if (domains && domains.length > 0) {
    for (const domain of domains) {
      if (domain.daysLeft !== null && domain.daysLeft < 30) {
        recommendations.push({
          id: `domain-expiry-${domain.domain}`,
          provider: "domains",
          category: "expiry",
          severity: domain.daysLeft < 7 ? "critical" : "warning",
          title: `Domain ${domain.domain} expiring soon`,
          description: `${domain.domain} expires in ${domain.daysLeft} days.`,
          action: `Renew ${domain.domain} immediately to avoid service interruption.`,
          saving: null,
          deadline: domain.expiresAt || undefined,
          icon: "🗓️",
        });
      }
    }
  }

  // Analyze GitHub
  if (githubData && githubData.length > 0) {
    const reposWithoutCI = githubData.filter((repo: any) => repo.ciRuns?.length === 0).length;
    if (reposWithoutCI > 0) {
      recommendations.push({
        id: "github-no-ci",
        provider: "github",
        category: "ci",
        severity: "warning",
        title: `${reposWithoutCI} repo(s) without CI/CD`,
        description: `${reposWithoutCI} repository(ies) have no CI/CD pipeline configured.`,
        action: "Set up GitHub Actions or another CI/CD tool for automated testing.",
        saving: null,
        deadline: null,
        icon: "🔄",
      });
    }

    const reposWithRiskyFiles = githubData.filter((repo: any) => repo.riskyFiles?.length > 0).length;
    if (reposWithRiskyFiles > 0) {
      recommendations.push({
        id: "github-risky-files",
        provider: "github",
        category: "security",
        severity: "critical",
        title: `${reposWithRiskyFiles} repo(s) with risky files`,
        description: `${reposWithRiskyFiles} repository(ies) contain .env, .key, or credentials files.`,
        action: "Remove all credentials from version control and rotate any exposed secrets.",
        saving: null,
        deadline: null,
        icon: "🔐",
      });
    }
  }

  // Calculate totals
  let totalMonthlySpend = 0;
  if (providers.openai?.monthlySpendUsd) totalMonthlySpend += providers.openai.monthlySpendUsd;
  if (providers.stripe?.monthlyRecurringRevenue) totalMonthlySpend += providers.stripe.monthlyRecurringRevenue;

  // Sort recommendations by severity
  const severityOrder = { critical: 0, warning: 1, saving: 2, info: 3 };
  recommendations.sort((a, b) => severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder]);

  // Limit to 12 recommendations
  const topRecommendations = recommendations.slice(0, 12);

  return {
    summary: topRecommendations.length > 0
      ? `${topRecommendations[0].title} — ${topRecommendations.length} issues found`
      : "Infrastructure health is good",
    totalMonthlySpendUsd: totalMonthlySpend > 0 ? totalMonthlySpend : null,
    potentialMonthlySavingsUsd: topRecommendations.filter(r => r.severity === "saving").reduce((sum, r) => {
      const match = r.saving?.match(/\$(\d+)/);
      return sum + (match ? parseInt(match[1]) : 0);
    }, 0) || null,
    recommendations: topRecommendations,
  };
}

/**
 * Call local Ollama model for analysis
 * This is a fallback if you want to use actual Ollama instead of mock analysis
 */
export async function callLocalModel(prompt: string): Promise<string> {
  try {
    const response = await fetch(LOCAL_MODEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_MODEL_NAME,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local model error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || "";
  } catch (err) {
    console.error("[Eagle Eye] Local model error:", err);
    throw err;
  }
}
