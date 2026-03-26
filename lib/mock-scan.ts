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

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export const mockRecommendations: Recommendation[] = [
  {
    id: "domain-expiring-critical",
    provider: "domains",
    category: "expiry",
    severity: "critical",
    title: "myapp.com expires in 6 days",
    description: "myapp.com expires in 6 days. This is your primary domain — if it lapses, your app goes offline, email delivery stops, and Stripe webhooks will fail. This is a revenue-stopping event.",
    action: "Renew myapp.com immediately through your registrar before it enters the grace period.",
    saving: null,
    deadline: daysFromNow(6),
    icon: "🌐",
    reasoning: "Primary domain expiry cascades to every service behind it — app, email, payments all go down simultaneously.",
  },
  {
    id: "env-file-in-repo",
    provider: "github",
    category: "security",
    severity: "critical",
    title: "Secret file committed to repo",
    description: ".env.production is committed in api-gateway. This file contains production API keys and database credentials. Even after deletion it stays in git history — anyone with repo access can read it.",
    action: "Run BFG Repo-Cleaner to purge .env.production from history, then rotate every credential in that file.",
    saving: null,
    deadline: null,
    icon: "🔑",
    reasoning: "Exposed secrets in git history is an active credential leak. The CI failure on this repo means broken builds are also shipping this exposure.",
  },
  {
    id: "openai-approaching-limit",
    provider: "openai",
    category: "exhaustion",
    severity: "warning",
    title: "OpenAI at 78% — 5 days of runway",
    description: "You've spent $78.40 of your $100 hard limit with 5 days left in the billing period. At current burn rate ($3.50/day) you will hit the hard cutoff in ~6 days. When the hard limit is reached, all API calls return 429 and your app stops working.",
    action: "Raise the hard limit to $150 in OpenAI settings, or route non-critical calls to gpt-4o-mini today.",
    saving: null,
    deadline: daysFromNow(6),
    icon: "⚡",
    reasoning: "Cross-provider risk: OpenAI cutoff + domain expiry happening in the same 6-day window = compounded outage risk.",
  },
  {
    id: "supabase-db-at-84-pct",
    provider: "supabase",
    category: "exhaustion",
    severity: "warning",
    title: "Supabase staging DB at 84%",
    description: "staging-api is at 429 MB of 500 MB free-tier limit. At 5 commits/day pace, you'll hit the ceiling in ~2 weeks. Supabase pauses free-tier projects when they hit the limit.",
    action: "Upgrade staging-api to Supabase Pro ($25/mo) before the DB is paused and blocks your team.",
    saving: null,
    deadline: daysFromNow(14),
    icon: "🗄️",
    planAdvice: "upgrade",
    reasoning: "Active development pace (5 recent commits) + 84% DB usage = free tier exhaustion is imminent, not theoretical.",
  },
  {
    id: "ci-failing-api-gateway",
    provider: "github",
    category: "security",
    severity: "warning",
    title: "CI failing on api-gateway for 12h",
    description: "api-gateway has a failing CI build that's been red for 12 hours. This repo also has .env.production committed. Broken CI + exposed secrets means every failed build is executing with leaked credentials.",
    action: "Fix the CI failure in api-gateway — check the latest run logs for the root cause.",
    saving: null,
    deadline: null,
    icon: "🔴",
    reasoning: "Compound risk: the CI failure and the secret exposure are in the same repo, amplifying both issues.",
  },
  {
    id: "openai-model-savings",
    provider: "openai",
    category: "saving",
    severity: "saving",
    title: "Switch to gpt-4o-mini, save $28/mo",
    description: "79% of your OpenAI spend ($62 of $78) goes to gpt-4o. Routing summaries, classifications, and non-critical calls to gpt-4o-mini (which is 30x cheaper) would save roughly $28/mo based on your current usage split.",
    action: "Audit your API call sites and move non-critical completions to gpt-4o-mini.",
    saving: "$28/mo",
    deadline: null,
    icon: "💰",
    reasoning: "gpt-4o-mini handles 90% of use cases at 3% of the cost. The remaining 10% that needs full gpt-4o quality is the only reason to keep it.",
  },
  {
    id: "twilio-trial-upgrade",
    provider: "twilio",
    category: "plan-fit",
    severity: "warning",
    title: "Twilio Trial plan blocks production SMS",
    description: "Your Twilio account is on Trial. Trial accounts can only send to verified phone numbers — if any of your 3 numbers are unverified recipients, SMS delivery silently fails. This is a production blocker if you're sending to real users.",
    action: "Upgrade Twilio to a paid account ($0 fixed cost, pay-per-use) to remove trial restrictions.",
    saving: null,
    deadline: null,
    icon: "📞",
    planAdvice: "upgrade",
    reasoning: "Trial restrictions cause silent SMS failures — users don't receive messages and there's no error thrown.",
  },
  {
    id: "stripe-healthy",
    provider: "stripe",
    category: "plan-fit",
    severity: "info",
    title: "Stripe revenue pipeline healthy",
    description: "MRR is $1,299.99 across 3 active subscriptions. Available balance $5,234. No failed charges, no subscriptions flagged for cancellation.",
    action: "No action needed.",
    saving: null,
    deadline: null,
    icon: "💳",
    reasoning: "Revenue metrics are healthy. Monitoring for churn signals on next scan.",
  },
];

// ── Mock Analysis Result ──────────────────────────────────────────────────

export const mockAnalysis: AnalysisResult = {
  summary: "myapp.com expires in 6 days, OpenAI hits hard limit in ~6 days, .env.production leaked in git — 3 critical issues converging this week.",
  totalMonthlySpendUsd: 78.40,
  potentialMonthlySavingsUsd: 28,
  nextScanIn: 3600, // 1 hour — domain expiring in 6 days
  nextScanReason: "myapp.com expires in 6 days and OpenAI approaches hard limit simultaneously — hourly monitoring until resolved.",
  recommendations: mockRecommendations,
  systemicRisks: [
    "Converging outage window: myapp.com domain expiry and OpenAI hard limit cutoff both occur within the same 6-day window — either one alone takes the app down.",
    "Security exposure compounded by broken CI: .env.production committed to api-gateway + failing CI = leaked credentials executing in every broken build.",
  ],
  costOptimizations: [
    "Route non-critical OpenAI calls to gpt-4o-mini: save ~$28/mo at current usage (79% of spend is on gpt-4o for tasks that don't need it).",
    "Upgrade Supabase staging to Pro ($25/mo) now — free tier pause will block the entire engineering team within 2 weeks.",
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
