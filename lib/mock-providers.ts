// Mock provider data for testing and development
// This module provides realistic mock data based on official API documentation
// When real API keys are provided, the real fetchers in providers.ts will be used instead

export const mockOpenAI = {
  provider: "openai",
  plan: "pay-as-you-go",
  hardLimitUsd: 100,
  softLimitUsd: 50,
  monthlySpendUsd: 45.67,
  accessUntil: null,
  error: null,
  _summary: "pay-as-you-go · $45.67/mo",
  _signal: "At 46% of hard limit — usage is healthy.",
  _status: "good",
  models: [
    {
      id: "gpt-5.4",
      object: "model",
      owned_by: "openai",
      permission: [
        {
          id: "modelperm-xxxxxxxxxxxxxxxxxxxx",
          object: "model_permission",
          allow_create_engine: false,
          allow_sampling: true,
          allow_logprobs: true,
          allow_search_indices: false,
          allow_view: true,
          allow_fine_tuning: false,
          organization: "*",
          is_blocking: false,
        },
      ],
      root: "gpt-5.4",
      parent: null,
    },
    {
      id: "gpt-5.4-mini",
      object: "model",
      owned_by: "openai",
      root: "gpt-5.4-mini",
      parent: null,
    },
    {
      id: "gpt-5.4-nano",
      object: "model",
      owned_by: "openai",
      root: "gpt-5.4-nano",
      parent: null,
    },
  ],
  usage: {
    total_cost_usd: 45.67,
    period_start: "2026-03-01T00:00:00Z",
    period_end: "2026-03-31T23:59:59Z",
    usage_by_model: [
      {
        model_id: "gpt-5.4",
        input_tokens: 500000,
        output_tokens: 250000,
        cost_usd: 35.00,
      },
      {
        model_id: "gpt-5.4-mini",
        input_tokens: 200000,
        output_tokens: 100000,
        cost_usd: 10.67,
      },
    ],
  },
};

export const mockStripe = {
  provider: "stripe",
  availableBalance: 5234.56,
  currency: "USD",
  activeSubscriptions: 3,
  monthlyRecurringRevenue: 1299.99,
  _summary: "3 active subs · MRR $1,299.99",
  _signal: "Available balance: $5,234.56.",
  _status: "good",
  subscriptions: [
    {
      id: "sub_xxxxxxxxxxxxxxxxxxxx",
      status: "active",
      plan: "pro-monthly",
      amountUsd: 99.99,
      interval: "month",
      currentPeriodEnd: "2026-04-22T14:30:00Z",
      daysUntilRenewal: 31,
      cancelAtPeriodEnd: false,
    },
    {
      id: "sub_yyyyyyyyyyyyyyyyyyyy",
      status: "active",
      plan: "enterprise-annual",
      amountUsd: 1200.0,
      interval: "year",
      currentPeriodEnd: "2027-03-22T14:30:00Z",
      daysUntilRenewal: 365,
      cancelAtPeriodEnd: false,
    },
    {
      id: "sub_zzzzzzzzzzzzzzzzzzzz",
      status: "active",
      plan: "starter-monthly",
      amountUsd: 29.99,
      interval: "month",
      currentPeriodEnd: "2026-04-10T14:30:00Z",
      daysUntilRenewal: 19,
      cancelAtPeriodEnd: false,
    },
  ],
  balance: {
    object: "balance",
    available: [
      {
        amount: 523456,
        currency: "usd",
        source_types: {
          card: 523456,
        },
      },
    ],
    pending: [
      {
        amount: 150000,
        currency: "usd",
        source_types: {
          card: 150000,
        },
      },
    ],
    livemode: false,
  },
  error: null,
};

export const mockSupabase = {
  provider: "supabase",
  projectCount: 2,
  plan: "free",
  projects: [
    {
      name: "production-api",
      ref: "abcdefghijklmnop",
      plan: "pro",
      region: "us-east-1",
      status: "ACTIVE_HEALTHY",
      usage: {
        db_size: {
          usage: 450000000,
          limit: 536870912,
          pct: 0.84,
          label: "Database size",
          formatted: "429.2 MB",
        },
        egress: {
          usage: 3500000000,
          limit: 5368709120,
          pct: 0.65,
          label: "Bandwidth",
          formatted: "3.3 GB",
        },
        storage_size: {
          usage: 800000000,
          limit: 1099511627776,
          pct: 0.73,
          label: "Storage",
          formatted: "762.9 MB",
        },
        monthly_active_users: {
          usage: 12500,
          limit: null,
          pct: null,
          label: "MAU",
          formatted: "12500",
        },
      },
    },
    {
      name: "staging-api",
      ref: "qrstuvwxyzabcdef",
      plan: "free",
      region: "us-west-2",
      status: "ACTIVE_HEALTHY",
      usage: {
        db_size: {
          usage: 450000000,
          limit: 536870912,
          pct: 0.84,
          label: "Database size",
          formatted: "429.2 MB",
        },
        egress: {
          usage: 500000000,
          limit: 5368709120,
          pct: 0.09,
          label: "Bandwidth",
          formatted: "476.8 MB",
        },
        storage_size: {
          usage: 100000000,
          limit: 1099511627776,
          pct: 0.09,
          label: "Storage",
          formatted: "95.4 MB",
        },
        monthly_active_users: {
          usage: 2300,
          limit: 50000,
          pct: 0.046,
          label: "MAU",
          formatted: "2300",
        },
      },
    },
  ],
  usage: {
    abcdefghijklmnop: {
      db_size: {
        usage: 450000000,
        limit: null,
        pct: null,
        label: "Database size",
        formatted: "429.2 MB",
      },
    },
    qrstuvwxyzabcdef: {
      db_size: {
        usage: 450000000,
        limit: 536870912,
        pct: 0.84,
        label: "Database size",
        formatted: "429.2 MB",
      },
    },
  },
  _summary: "2 projects · free plan",
  _signal: "staging-api: Database size at 84% of free limit.",
  _status: "warn",
  error: null,
};

export const mockGitHub = {
  provider: "github",
  user: {
    login: "octocat",
    id: 1,
    node_id: "MDQ6VXNlcjE=",
    avatar_url: "https://github.com/images/error/octocat_happy.gif",
    name: "The Octocat",
    company: "GitHub",
    blog: "https://github.blog",
    location: "San Francisco",
    email: "octocat@github.com",
    bio: "There once was a ship...",
    public_repos: 8,
    public_gists: 2,
    followers: 3938,
    following: 9,
    created_at: "2008-01-14T04:33:35Z",
    updated_at: "2024-03-22T10:15:00Z",
  },
  repositories: [
    {
      id: 1296269,
      name: "Hello-World",
      full_name: "octocat/Hello-World",
      owner: {
        login: "octocat",
        id: 1,
        avatar_url: "https://github.com/images/error/octocat_happy.gif",
        type: "User",
      },
      private: false,
      html_url: "https://github.com/octocat/Hello-World",
      description: "This is your first repo!",
      fork: false,
      created_at: "2011-01-26T19:01:12Z",
      updated_at: "2024-03-22T10:15:00Z",
      pushed_at: "2024-03-22T09:30:00Z",
      size: 108,
      stargazers_count: 80,
      watchers_count: 80,
      language: "JavaScript",
      has_issues: true,
      has_projects: true,
      has_downloads: true,
      has_wiki: true,
      has_pages: false,
      forks_count: 9,
      open_issues_count: 0,
      default_branch: "master",
    },
    {
      id: 1296270,
      name: "Spoon-Knife",
      full_name: "octocat/Spoon-Knife",
      owner: {
        login: "octocat",
        id: 1,
        avatar_url: "https://github.com/images/error/octocat_happy.gif",
        type: "User",
      },
      private: false,
      html_url: "https://github.com/octocat/Spoon-Knife",
      description: "This your first repo!",
      fork: true,
      created_at: "2011-01-26T19:01:12Z",
      updated_at: "2024-03-20T14:22:00Z",
      pushed_at: "2024-03-20T14:22:00Z",
      size: 1024,
      stargazers_count: 2000,
      watchers_count: 2000,
      language: "Python",
      has_issues: true,
      has_projects: false,
      has_downloads: true,
      has_wiki: true,
      has_pages: false,
      forks_count: 1200,
      open_issues_count: 5,
      default_branch: "main",
    },
  ],
  dependencies: {
    sbom: {
      SPDXID: "SPDXRef-DOCUMENT",
      spdxVersion: "SPDX-2.3",
      creationInfo: {
        created: "2024-03-22T12:00:00Z",
        creators: ["Tool: GitHub Dependency Graph"],
      },
      name: "octocat/Hello-World SBOM",
      dataLicense: "CC0-1.0",
      packages: [
        {
          name: "react",
          versionInfo: "18.2.0",
          SPDXID: "SPDXRef-Package-react",
          externalRefs: [
            {
              referenceCategory: "PACKAGE_MANAGER",
              referenceLocator: "pkg:npm/react@18.2.0",
              referenceType: "purl",
            },
          ],
        },
        {
          name: "next",
          versionInfo: "13.4.19",
          SPDXID: "SPDXRef-Package-next",
          externalRefs: [
            {
              referenceCategory: "PACKAGE_MANAGER",
              referenceLocator: "pkg:npm/next@13.4.19",
              referenceType: "purl",
            },
          ],
        },
        {
          name: "typescript",
          versionInfo: "5.0.2",
          SPDXID: "SPDXRef-Package-typescript",
          externalRefs: [
            {
              referenceCategory: "PACKAGE_MANAGER",
              referenceLocator: "pkg:npm/typescript@5.0.2",
              referenceType: "purl",
            },
          ],
        },
      ],
    },
  },
  _summary: "8 public repos · 3,938 followers",
  _signal: "Active development with recent commits. Dependencies are up-to-date.",
  _status: "good",
  error: null,
};

export const mockAnthropic = {
  provider: "anthropic",
  keyValid: true,
  status: "active",
  error: null,
  _summary: "API key active",
  _signal: "Key is valid. No billing API — track expiry on Key Hygiene page.",
  _status: "good",
  models: [
    {
      id: "claude-opus-4-6",
      description: "The most intelligent model for building agents and coding",
      capabilities: {
        extended_thinking: true,
        adaptive_thinking: true,
        priority_tier: true,
        context_window: "1M tokens",
        max_output: "128k tokens",
      },
      pricing: {
        input_mtok: 5,
        output_mtok: 25,
      },
      knowledge_cutoff: "May 2025",
      training_data_cutoff: "Aug 2025",
    },
    {
      id: "claude-sonnet-4-6",
      description: "The best combination of speed and intelligence",
      capabilities: {
        extended_thinking: true,
        adaptive_thinking: true,
        priority_tier: true,
        context_window: "1M tokens",
        max_output: "64k tokens",
      },
      pricing: {
        input_mtok: 3,
        output_mtok: 15,
      },
      knowledge_cutoff: "Aug 2025",
      training_data_cutoff: "Jan 2026",
    },
    {
      id: "claude-haiku-4-5-20251001",
      description: "The fastest model with near-frontier intelligence",
      capabilities: {
        extended_thinking: true,
        adaptive_thinking: false,
        priority_tier: true,
        context_window: "200k tokens",
        max_output: "64k tokens",
      },
      pricing: {
        input_mtok: 1,
        output_mtok: 5,
      },
      knowledge_cutoff: "Feb 2025",
      training_data_cutoff: "Jul 2025",
    },
  ],
  usage: {
    total_cost_usd: 12.50,
    period_start: "2026-03-01T00:00:00Z",
    period_end: "2026-03-31T23:59:59Z",
    usage_by_model: [
      {
        model_id: "claude-opus-4-6",
        input_tokens: 100000,
        output_tokens: 50000,
        cost_usd: 10.0,
      },
      {
        model_id: "claude-sonnet-4-6",
        input_tokens: 20000,
        output_tokens: 10000,
        cost_usd: 2.5,
      },
    ],
    hard_limit_usd: 50.0,
    current_spend_usd: 12.5,
    remaining_spend_usd: 37.5,
  },
};

export const mockDomains = [
  {
    domain: "example.com",
    expiresAt: "2025-06-15T00:00:00Z",
    daysLeft: 85,
    registeredAt: "2020-06-15T00:00:00Z",
    status: ["ok"],
    nameservers: ["ns1.example.com", "ns2.example.com"],
    error: null,
  },
  {
    domain: "api.example.com",
    expiresAt: "2025-05-22T00:00:00Z",
    daysLeft: 61,
    registeredAt: "2021-05-22T00:00:00Z",
    status: ["ok"],
    nameservers: ["ns1.example.com", "ns2.example.com"],
    error: null,
  },
  {
    domain: "expiring-soon.com",
    expiresAt: "2026-04-01T00:00:00Z",
    daysLeft: 10,
    registeredAt: "2022-04-01T00:00:00Z",
    status: ["ok"],
    nameservers: ["ns1.expiring-soon.com"],
    error: null,
  },
];

export const mockVercel = {
  provider: "vercel",
  plan: "pro",
  teamName: "My Team",
  projectCount: 5,
  _summary: "pro · 5 projects",
  _signal: "Plan looks appropriate for current usage.",
  _status: "good",
  projects: [
    {
      name: "my-app",
      framework: "nextjs",
      lastDeployed: "2024-03-22T10:15:00Z",
    },
    {
      name: "api-server",
      framework: "nodejs",
      lastDeployed: "2024-03-21T14:30:00Z",
    },
    {
      name: "landing-page",
      framework: "nextjs",
      lastDeployed: "2024-03-20T09:45:00Z",
    },
    {
      name: "docs",
      framework: "nextjs",
      lastDeployed: "2024-03-19T16:20:00Z",
    },
    {
      name: "dashboard",
      framework: "react",
      lastDeployed: "2024-03-18T11:00:00Z",
    },
  ],
  billingPeriodEnd: "2026-04-22T00:00:00Z",
  error: null,
};

export const mockResend = {
  provider: "resend",
  domainCount: 2,
  domains: [
    {
      name: "mail.example.com",
      status: "verified",
      region: "us-east-1",
      createdAt: "2024-01-15T10:00:00Z",
    },
    {
      name: "noreply.example.com",
      status: "verified",
      region: "us-east-1",
      createdAt: "2024-02-20T14:30:00Z",
    },
  ],
  _summary: "2 domains · 2 verified",
  _signal: "2 domains verified and ready to send.",
  _status: "good",
  error: null,
};

export const mockTwilio = {
  provider: "twilio",
  accountStatus: "active",
  friendlyName: "My Twilio Account",
  type: "Trial",
  balance: "15.50",
  phoneNumberCount: 3,
  phoneNumbers: [
    {
      friendlyName: "Main Number",
      phoneNumber: "+1234567890",
      capabilities: {
        voice: true,
        sms: true,
        mms: true,
      },
    },
    {
      friendlyName: "Support Line",
      phoneNumber: "+1234567891",
      capabilities: {
        voice: true,
        sms: true,
        mms: false,
      },
    },
    {
      friendlyName: "SMS Only",
      phoneNumber: "+1234567892",
      capabilities: {
        voice: false,
        sms: true,
        mms: true,
      },
    },
  ],
  _summary: "Trial · 3 numbers",
  _signal: "Balance $15.50 — looks healthy.",
  _status: "good",
  error: null,
};

export function getMockProvider(provider: string): any {
  const mockProviders: Record<string, any> = {
    openai: mockOpenAI,
    stripe: mockStripe,
    supabase: mockSupabase,
    github: mockGitHub,
    anthropic: mockAnthropic,
    vercel: mockVercel,
    resend: mockResend,
    twilio: mockTwilio,
  };

  return mockProviders[provider] || null;
}

export function getAllMockProviders(): Record<string, any> {
  return {
    openai: mockOpenAI,
    stripe: mockStripe,
    supabase: mockSupabase,
    github: mockGitHub,
    anthropic: mockAnthropic,
    vercel: mockVercel,
    resend: mockResend,
    twilio: mockTwilio,
  };
}

export function getMockDomains(): any[] {
  return mockDomains;
}
