# Eagle Eye

AI-powered dev infrastructure intelligence. Eagle Eye monitors your GitHub repos and cloud provider integrations, runs Claude AI analysis, and surfaces actionable recommendations — so you know about expiring keys, quota exhaustion, and plan fit issues before they cause an outage.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20db-green?logo=supabase)
![Claude](https://img.shields.io/badge/Claude-Opus%204.6-orange?logo=anthropic)

## What it does

- **GitHub monitoring** — CI status, open PRs, commit activity, and risky file detection (secrets, `.env` files) across all your repos
- **Provider health** — real-time spend and status cards for OpenAI, Stripe, Vercel, Resend, Twilio, Anthropic, and Supabase
- **Domain expiry** — RDAP-based tracking with urgency-aware alerts
- **API key hygiene** — tracks key expiry dates across all integrations and alerts before they expire
- **AI recommendations** — Claude Opus 4.6 analyzes your full infra state and generates prioritised, concrete actions (not suggestions)
- **Plan fit** — tells you whether to upgrade, downgrade, or stay on each provider plan, with the exact numbers
- **Usage trends** — per-provider spend, GitHub activity rollups, CI run breakdowns

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript 5 |
| Auth + DB | Supabase (GitHub OAuth, PKCE) |
| AI | Anthropic Claude Opus 4.6 (adaptive thinking) |
| Background jobs | Upstash QStash |
| Caching | localStorage (5-min TTL) + Upstash Redis |
| Styling | Tailwind CSS v4 |

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project with GitHub OAuth configured
- An [Anthropic](https://console.anthropic.com) API key
- An [Upstash](https://upstash.com) account (QStash for background scans)

### 1. Clone and install

```bash
git clone git@github.com:noderme/eagleeye.git
cd eagleeye
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Encryption (AES-256-GCM key for storing provider secrets)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=<64 hex chars>

# Upstash QStash (for scheduled background scans)
QSTASH_URL=https://qstash.upstash.io
QSTASH_TOKEN=<token>
QSTASH_CURRENT_SIGNING_KEY=<signing key>
QSTASH_NEXT_SIGNING_KEY=<next signing key>

# App URL (used for QStash callbacks)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database

Run the following SQL in your Supabase SQL editor:

```sql
-- User repos
create table repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  repos jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Encrypted provider keys
create table integration_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  provider text not null,
  encrypted_key text not null,
  extra_config jsonb default '{}',
  created_at timestamptz default now(),
  unique(user_id, provider)
);

-- Scan results
create table scan_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  github_data jsonb default '[]',
  provider_data jsonb default '{}',
  domain_data jsonb default '[]',
  analysis jsonb,
  scanned_at timestamptz default now(),
  error text
);

-- Enable RLS on all tables
alter table repos enable row level security;
alter table integration_keys enable row level security;
alter table scan_results enable row level security;

-- RLS policies (users can only see their own data)
create policy "own repos" on repos for all using (auth.uid() = user_id);
create policy "own keys" on integration_keys for all using (auth.uid() = user_id);
create policy "own scans" on scan_results for all using (auth.uid() = user_id);
```

### 4. Supabase GitHub OAuth

In your Supabase project → Authentication → Providers → GitHub:
- Enable GitHub provider
- Set callback URL to `https://<your-domain>/auth/callback`
- Add `repo` and `read:user` to the OAuth scopes

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  auth/callback/       GitHub OAuth callback
  dashboard/
    page.tsx           Overview (scan trigger, provider health, repos)
    alerts/            Critical alerts page
    recommendations/   AI-generated recommendations
    usage/             Usage trends per provider
    plan-fit/          Plan fit verdict per provider
    keys/              API key hygiene
    integrations/      Add/remove provider integrations
    settings/          User settings
  onboarding/          First-run repo selection + initial scan
  api/
    scan/
      trigger/         POST — runs a full scan
      save/            POST — persists scan result to DB
      results/         GET  — fetches latest scan result
      job/             POST — QStash webhook for scheduled scans
    github/
      repos/           GET  — lists user's GitHub repos
      store-token/     POST — persists GitHub OAuth token
    keys/              CRUD for integration keys
    repos/             POST — saves selected repos

lib/
  providers.ts         All provider API fetchers
  analyze.ts           Claude Opus 4.6 analysis + recommendation engine
  github.ts            GitHub API helpers
  scan-cache.ts        localStorage cache (5-min TTL)
  crypto.ts            AES-256-GCM encrypt/decrypt for stored keys
  supabase/            Supabase client (browser + server + service role)
  summarize/           Per-provider data summarizers for Claude context

components/
  sidebar.tsx          Navigation sidebar
  topbar.tsx           Page topbar with Switch project + alerts
```

## Supported integrations

| Provider | Data fetched |
|---|---|
| OpenAI | Monthly spend, hard limit, plan |
| Stripe | MRR, active subscriptions, available balance |
| Vercel | Plan, project count, team |
| Resend | Domain count, verified domains |
| Twilio | Balance, phone number count, account type |
| Anthropic | API key validity |
| Supabase | Plan, project count |
| Custom | Any provider via Claude agentic HTTP fetch |

## Deployment

Deploy to Vercel:

```bash
vercel --prod
```

Set all environment variables in the Vercel dashboard. Update `NEXT_PUBLIC_APP_URL` to your production URL so QStash callbacks reach the correct endpoint.

## License

MIT
