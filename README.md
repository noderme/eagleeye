# Eagle Eye 🦅

**AI-powered infrastructure intelligence for developers.**

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20db-green?logo=supabase)
![License](https://img.shields.io/badge/license-MIT-blue)

Eagle Eye connects to your developer tools — GitHub, Stripe, Supabase, Vercel, Resend, Twilio, and more — runs a full scan, and uses AI to surface what's broken, what's expiring, and what's costing you money. You bring your own LLM key (OpenAI, Anthropic, or Gemini). Eagle Eye never stores your secrets in plaintext.

**Live demo:** [eagleeye-livid.vercel.app](https://eagleeye-livid.vercel.app)

## What it does

Eagle Eye scans your connected integrations and produces a single, prioritised report:

- **GitHub** — stale branches, open PRs, dependency alerts, repo health
- **Stripe** — failed charges, churn signals, subscription anomalies
- **Supabase** — database size, RLS gaps, slow queries
- **Vercel** — failed deployments, function timeouts, edge config drift
- **Resend / Twilio** — delivery failures, bounce rates, quota usage
- **Custom domains** — SSL expiry, DNS misconfigurations
- **Any provider** — add your own API keys and Eagle Eye includes them in the AI analysis

All findings are ranked by severity and explained in plain English — no dashboards to learn, no alerts to configure.

---

## Why open source?

Eagle Eye asks you to connect your most sensitive keys. You should be able to read every line of code that touches them. Self-host it, audit it, fork it.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, Tailwind CSS, TypeScript |
| Backend | Next.js API routes (serverless) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + GitHub OAuth |
| AI analysis | OpenAI `gpt-4o-mini` / Anthropic `claude-3-5-sonnet` / Google `gemini-2.0-flash` |
| Encryption | AES-256-GCM (all stored keys encrypted at rest) |
| Deployment | Vercel (zero-config) |

## Self-hosting

### 1. Clone the repo

```bash
git clone https://github.com/noderme/eagleeye.git
cd eagleeye
npm install
```

### 2. Set up Supabase

Create a free project at [supabase.com](https://supabase.com), then run the migration in **SQL Editor**:

```bash
# The full migration is in the repo root
cat supabase-migration.sql
```

Paste the contents into Supabase → SQL Editor → Run.

### 3. Create a GitHub OAuth App

Go to [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**.

- **Homepage URL:** your deployment URL
- **Authorization callback URL:** `https://<your-supabase-project>.supabase.co/auth/v1/callback`

Copy the Client ID and Secret into Supabase → Authentication → Providers → GitHub.

### 4. Configure environment variables

Create `.env.local` in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Encryption — generate with: openssl rand -hex 32
ENCRYPTION_KEY=your-64-char-hex-string

# Mock mode — set to false for real data
NEXT_PUBLIC_USE_MOCK_DATA=false

# Optional: QStash for background scheduled scans
# QSTASH_TOKEN=
# QSTASH_CURRENT_SIGNING_KEY=
# QSTASH_NEXT_SIGNING_KEY=
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Deploy to Vercel

```bash
npx vercel --prod
```

Add all environment variables in Vercel → Settings → Environment Variables. Vercel injects `VERCEL_URL` automatically — no need to set `NEXT_PUBLIC_APP_URL`.

## Adding your LLM key

Eagle Eye does not include a built-in LLM key. After signing in, go to **Integrations → AI Analysis Engine** and add one of:

| Provider | Model used | Free tier |
|---|---|---|
| OpenAI | `gpt-4o-mini` | No — ~$0.001/scan |
| Anthropic | `claude-3-5-sonnet-20241022` | No — ~$0.003/scan |
| Google Gemini | `gemini-2.0-flash` | Yes — 1,500 req/day |

Google Gemini is the recommended starting point for self-hosters.

---

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
| Custom | Any provider — Eagle Eye includes it in AI analysis |

## Contributing

Contributions are welcome. The most valuable things you can add:

- **New provider integrations** — add a fetcher in `lib/providers.ts` and a card in the integrations page
- **Better AI prompts** — improve the analysis quality in `lib/analyze.ts`
- **Bug reports** — open an issue with the error message and steps to reproduce

Please open an issue before starting a large feature so we can discuss the approach.

---

## Roadmap

- [ ] Scheduled scans (daily/weekly) via QStash
- [ ] Email digest of scan results
- [ ] Slack / Discord notifications
- [ ] Team workspaces (multiple users per account)
- [ ] Provider-specific drill-down pages

---

## License

MIT — do whatever you want, just don't remove the license header.
