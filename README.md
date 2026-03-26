# Eagle Eye 🦅

**One scan to see what's broken, expiring, or burning money across all your dev services.**

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20db-green?logo=supabase)
![License](https://img.shields.io/badge/license-MIT-blue)

Eagle Eye connects to your developer services, runs a full scan, and uses an LLM to surface what actually matters — domains about to expire, quotas running out, secrets exposed in git, costs drifting. One report, ranked by urgency, explained in plain English.

You bring your own LLM key. Eagle Eye never stores your secrets in plaintext.

**Live demo (no login required):** [eagleeye-livid.vercel.app](https://eagleeye-livid.vercel.app)

---

## What it does

Connect your services and Eagle Eye tells you:

- **GitHub** — failing CI, exposed secret files, open PRs, risky commits
- **Stripe** — subscription renewals, churn signals, balance health
- **Supabase** — database size, quota approaching, project status
- **Vercel** — plan fit, build usage, function costs
- **OpenAI / Anthropic** — spend vs. hard limit, model cost breakdown
- **Resend / Twilio** — unverified domains, trial restrictions, delivery blockers
- **Custom domains** — days until expiry, DNS status
- **Any provider** — paste an API key and Eagle Eye discovers what to monitor automatically

All findings are cross-correlated across providers and ranked by severity. No dashboards to learn, no alerts to configure.

---

## How the discovery engine works

There's no hardcoded list of "what to check" per provider. Instead:

1. An LLM agent reads the provider's API documentation
2. It identifies all monitoring-relevant endpoints (usage, billing, limits, health)
3. It verifies each endpoint with a real HTTP call using your credentials
4. The verified endpoint map is cached — future scans reuse it at zero LLM cost

Adding a new provider is just adding an API key — no code changes required.

---

## Why open source?

Eagle Eye asks you to connect your most sensitive keys. You should be able to read every line of code that touches them. Self-host it, audit it, fork it.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, Tailwind CSS, TypeScript |
| Backend | Next.js API routes (serverless) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth + GitHub OAuth |
| AI analysis | OpenAI `gpt-4o` / Anthropic `claude-3-5-sonnet` / Gemini `gemini-2.0-flash` / Ollama (local) |
| Encryption | AES-256-GCM (all stored keys encrypted at rest) |
| Deployment | Vercel (zero-config) |

---

## Self-hosting

### 1. Clone the repo

```bash
git clone https://github.com/noderme/eagleeye.git
cd eagleeye
npm install
```

### 2. Set up Supabase

Create a free project at [supabase.com](https://supabase.com), then run the migration:

Paste the contents of `supabase-migration.sql` into Supabase → SQL Editor → Run.

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

# Mock mode — set to true for demo without real keys
NEXT_PUBLIC_USE_MOCK_DATA=false
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

Add all environment variables in Vercel → Settings → Environment Variables.

---

## Adding your LLM key

Eagle Eye does not include a built-in LLM key. After signing in, go to **Integrations → AI Analysis Engine** and add one of:

| Provider | Model used | Cost per scan |
|---|---|---|
| Google Gemini | `gemini-2.0-flash` | Free — 1,500 req/day |
| OpenAI | `gpt-4o` | ~$0.002/scan |
| Anthropic | `claude-3-5-sonnet-20241022` | ~$0.003/scan |
| Ollama | any local model | Free — runs on your machine |

**Recommended for self-hosters:** Google Gemini (free tier) or Ollama (fully local, no API costs).

---

## Supported integrations

| Provider | What Eagle Eye checks |
|---|---|
| OpenAI | Monthly spend vs. hard limit, model cost breakdown |
| Anthropic | API key validity, spend, model usage |
| Stripe | MRR, active subscriptions, balance, renewal dates |
| Vercel | Plan fit, build minutes, function costs |
| Supabase | DB size, bandwidth, project quota |
| Resend | Verified domains, plan limits |
| Twilio | Account type, balance, trial restrictions |
| Custom domains | Days until expiry, DNS status |
| Any provider | LLM discovers endpoints from API docs automatically |

---

## Project structure

```
app/
  dashboard/
    page.tsx           Overview — scan trigger, provider health, repos
    alerts/            Critical alerts
    recommendations/   AI-generated recommendations
    usage/             Usage trends per provider
    plan-fit/          Plan fit verdict per provider
    keys/              API key hygiene and expiry
    integrations/      Add/remove provider integrations
  api/
    scan/trigger/      POST — runs a full scan (rate-limited: 1/60s)
    scan/results/      GET  — fetches latest scan result
    scan/save/         POST — persists scan result to DB
    keys/              CRUD for stored API keys

lib/
  discovery-engine.ts  LLM-powered endpoint discovery + verification
  analyze.ts           Cross-provider analysis + recommendation engine
  providers-dynamic.ts Unified provider pipeline
  crypto.ts            AES-256-GCM encrypt/decrypt
  errors.ts            Error sanitization for all providers
```

---

## Contributing

Contributions are welcome. The most valuable things to add:

- **New provider integrations** — just add an API key; the discovery engine handles the rest
- **Better analysis prompts** — improve cross-provider reasoning in `lib/analyze.ts`
- **Bug reports** — open an issue with the error and steps to reproduce

Please open an issue before starting a large feature.

---

## Roadmap

- [ ] Scheduled scans (daily/weekly)
- [ ] Email digest of scan results
- [ ] Slack / Discord notifications
- [ ] Team workspaces (multiple users per account)

---

## License

MIT — do whatever you want, just don't remove the license header.
