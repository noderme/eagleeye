// Complete mock scan result for testing without authentication or database
// This provides a full ScanResult object that the dashboard can render directly

import {
  mockOpenAI,
  mockStripe,
  mockSupabase,
  mockAnthropic,
  mockVercel,
  mockResend,
  mockTwilio,
  mockDomains,
} from "./mock-providers";
import type { RepoInsight } from "./github";
import type { Recommendation, AnalysisResult } from "./analyze";

// ── Mock GitHub Insights ──────────────────────────────────────────────────

export const mockGitHubInsights: RepoInsight[] = [
  {
    repo: {
      full_name: "octocat/eagle-eye-app",
      name: "eagle-eye-app",
      private: false,
      language: "TypeScript",
      pushed_at: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 hours ago
      open_issues_count: 3,
      default_branch: "main",
    },
    commits: [
      { sha: "abc1234", message: "feat: add provider discovery engine", author: "octocat", date: new Date(Date.now() - 2 * 3600000).toISOString() },
      { sha: "def5678", message: "fix: handle API timeout gracefully", author: "octocat", date: new Date(Date.now() - 8 * 3600000).toISOString() },
      { sha: "ghi9012", message: "chore: update dependencies", author: "dependabot[bot]", date: new Date(Date.now() - 24 * 3600000).toISOString() },
      { sha: "jkl3456", message: "docs: update README with new features", author: "octocat", date: new Date(Date.now() - 48 * 3600000).toISOString() },
      { sha: "mno7890", message: "refactor: clean up provider fetchers", author: "octocat", date: new Date(Date.now() - 72 * 3600000).toISOString() },
    ],
    ciRuns: [
      { id: 1001, name: "CI / Build & Test", conclusion: "success", status: "completed", created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
      { id: 1002, name: "CI / Lint", conclusion: "success", status: "completed", created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
    ],
    riskyFiles: [],
    openPRs: 2,
    detectedProviders: ["openai", "stripe", "supabase", "vercel", "resend"],
  },
  {
    repo: {
      full_name: "octocat/api-gateway",
      name: "api-gateway",
      private: true,
      language: "Go",
      pushed_at: new Date(Date.now() - 12 * 3600000).toISOString(), // 12 hours ago
      open_issues_count: 1,
      default_branch: "main",
    },
    commits: [
      { sha: "pqr1234", message: "feat: add rate limiting middleware", author: "octocat", date: new Date(Date.now() - 12 * 3600000).toISOString() },
      { sha: "stu5678", message: "fix: connection pool leak", author: "octocat", date: new Date(Date.now() - 36 * 3600000).toISOString() },
      { sha: "vwx9012", message: "test: add integration tests", author: "octocat", date: new Date(Date.now() - 60 * 3600000).toISOString() },
    ],
    ciRuns: [
      { id: 2001, name: "CI / Build", conclusion: "failure", status: "completed", created_at: new Date(Date.now() - 12 * 3600000).toISOString() },
    ],
    riskyFiles: [".env.production"],
    openPRs: 1,
    detectedProviders: ["twilio", "anthropic"],
  },
  {
    repo: {
      full_name: "octocat/landing-page",
      name: "landing-page",
      private: false,
      language: "TypeScript",
      pushed_at: new Date(Date.now() - 72 * 3600000).toISOString(), // 3 days ago
      open_issues_count: 0,
      default_branch: "main",
    },
    commits: [
      { sha: "yza1234", message: "style: update hero section", author: "octocat", date: new Date(Date.now() - 72 * 3600000).toISOString() },
      { sha: "bcd5678", message: "feat: add pricing page", author: "octocat", date: new Date(Date.now() - 96 * 3600000).toISOString() },
    ],
    ciRuns: [
      { id: 3001, name: "Deploy / Vercel", conclusion: "success", status: "completed", created_at: new Date(Date.now() - 72 * 3600000).toISOString() },
    ],
    riskyFiles: [],
    openPRs: 0,
    detectedProviders: ["vercel"],
  },
];

// ── Mock Analysis Recommendations ─────────────────────────────────────────

export const mockRecommendations: Recommendation[] = [
  {
    id: "domain-expiring-soon",
    provider: "domains",
    category: "expiry",
    severity: "critical",
    title: "Domain expires in 10 days",
    description: "expiring-soon.com expires on April 1, 2026. If this domain lapses, your application will become unreachable and email delivery will fail. This affects all services routing through this domain.",
    action: "Renew expiring-soon.com immediately through your registrar.",
    saving: null,
    deadline: "2026-04-01T00:00:00Z",
    icon: "🌐",
    reasoning: "Domain expiry is the highest-priority risk because it cascades to all services using this domain.",
  },
  {
    id: "supabase-db-at-84-pct",
    provider: "supabase",
    category: "exhaustion",
    severity: "warning",
    title: "Supabase DB at 84% capacity",
    description: "staging-api database is at 429.2 MB of 500 MB free-tier limit (84%). At current growth rate, you will hit the limit within 2-3 weeks. Combined with OpenAI spending at 46% of limit, this suggests infrastructure is scaling faster than plan tiers.",
    action: "Upgrade staging-api to Supabase Pro ($25/mo) to get 8 GB database limit.",
    saving: null,
    deadline: null,
    icon: "⚡",
    planAdvice: "upgrade",
    reasoning: "Cross-provider signal: Supabase approaching limit + active development (5 commits in 3 days) = growth is outpacing free tier.",
  },
  {
    id: "ci-failing-api-gateway",
    provider: "github",
    category: "security",
    severity: "warning",
    title: "CI failing on api-gateway repo",
    description: "The api-gateway repository has a failing CI build from 12 hours ago. This repo also has a risky file (.env.production) committed. Failing CI + exposed secrets = compound security risk.",
    action: "Fix the CI failure in api-gateway and remove .env.production from the repository using git filter-branch.",
    saving: null,
    deadline: null,
    icon: "🔴",
    reasoning: "Compound risk: failing CI means broken deployments, and .env.production in repo means credentials may be exposed in git history.",
  },
  {
    id: "env-file-in-repo",
    provider: "github",
    category: "security",
    severity: "critical",
    title: "Secret file committed to repo",
    description: ".env.production is committed in the api-gateway repository. This file likely contains production API keys and database credentials. Even if the file is later deleted, it remains in git history.",
    action: "Remove .env.production using git filter-branch or BFG Repo-Cleaner, then rotate all credentials in that file.",
    saving: null,
    deadline: null,
    icon: "🔑",
    reasoning: "Exposed secrets in git history are a critical security vulnerability that requires immediate remediation.",
  },
  {
    id: "openai-spend-optimization",
    provider: "openai",
    category: "saving",
    severity: "saving",
    title: "Optimize OpenAI model usage",
    description: "You're spending $45.67/mo on OpenAI, with 77% ($35.00) going to gpt-5.4. Switching non-critical calls to gpt-5.4-mini could reduce costs by 40-60% for those calls, saving approximately $14-21/mo.",
    action: "Audit API calls and route non-critical requests (summaries, classifications) to gpt-5.4-mini.",
    saving: "$14-21/mo",
    deadline: null,
    icon: "💰",
    reasoning: "gpt-5.4 is used for 77% of spend. Many use cases don't require the full model capability.",
  },
  {
    id: "stripe-subscription-renewal",
    provider: "stripe",
    category: "drift",
    severity: "info",
    title: "Stripe subscription renews in 19 days",
    description: "Your starter-monthly subscription ($29.99/mo) renews on April 10. With MRR at $1,299.99 across 3 subscriptions, your revenue pipeline is healthy. No action needed unless you plan to change plans.",
    action: "Review subscription tiers before April 10 renewal if considering changes.",
    saving: null,
    deadline: "2026-04-10T14:30:00Z",
    icon: "💳",
    reasoning: "Routine renewal notification. Revenue pipeline is healthy with $1,299.99 MRR.",
  },
  {
    id: "vercel-plan-fit",
    provider: "vercel",
    category: "plan-fit",
    severity: "info",
    title: "Vercel Pro plan fits well",
    description: "You're on the Pro plan with 5 projects. Usage is well within Pro limits. No upgrade or downgrade needed at this time.",
    action: "No action needed. Continue monitoring as project count grows.",
    saving: null,
    deadline: null,
    icon: "▲",
    planAdvice: "stay",
    reasoning: "5 projects on Pro plan is within limits. Would only need to upgrade at 20+ projects or high bandwidth usage.",
  },
  {
    id: "twilio-trial-upgrade",
    provider: "twilio",
    category: "plan-fit",
    severity: "warning",
    title: "Twilio still on Trial plan",
    description: "Your Twilio account is on the Trial plan with $15.50 balance and 3 phone numbers. Trial accounts have sending restrictions and cannot send to unverified numbers. If you're using Twilio in production, this is a blocker.",
    action: "Upgrade Twilio to a paid account to remove trial restrictions.",
    saving: null,
    deadline: null,
    icon: "📞",
    planAdvice: "upgrade",
    reasoning: "Trial plan restrictions will block production SMS/voice delivery.",
  },
];

// ── Mock Analysis Result ──────────────────────────────────────────────────

export const mockAnalysis: AnalysisResult = {
  summary: "1 domain expiring in 10 days, 1 CI failure, 1 secret file exposed — 3 issues need immediate attention.",
  totalMonthlySpendUsd: 45.67,
  potentialMonthlySavingsUsd: 21,
  nextScanIn: 21600, // 6 hours — domain expiring soon
  nextScanReason: "Domain expiring-soon.com expires in 10 days, requiring frequent monitoring.",
  recommendations: mockRecommendations,
  systemicRisks: [
    "Infrastructure scaling faster than plan tiers: Supabase at 84% + active development pace suggests free tier will be exhausted within weeks.",
    "Security posture gap: .env.production in git history + failing CI = potential for credential exposure in broken builds.",
  ],
  costOptimizations: [
    "Switch non-critical OpenAI calls to gpt-5.4-mini: save $14-21/mo (40-60% reduction on those calls).",
    "Upgrade Supabase staging to Pro ($25/mo) before hitting overage charges that could cost $50+/mo.",
  ],
};

// ── Complete Mock Scan Result ─────────────────────────────────────────────

export function getMockScanResult() {
  return {
    id: "mock-scan-001",
    user_id: "mock-user-001",
    scanned_at: new Date().toISOString(),
    github_data: mockGitHubInsights,
    provider_data: {
      openai: mockOpenAI,
      stripe: mockStripe,
      supabase: mockSupabase,
      anthropic: mockAnthropic,
      vercel: mockVercel,
      resend: mockResend,
      twilio: mockTwilio,
    },
    domain_data: mockDomains,
    analysis: mockAnalysis,
    error: null,
  };
}
