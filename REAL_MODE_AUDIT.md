# Eagle Eye: Mock to Real Mode — Honest Audit

## The One-Line Switch

Setting `NEXT_PUBLIC_USE_MOCK_DATA=false` in `.env.local` **does** correctly disable mock data across all API routes, the middleware, the landing page, and the provider fetchers. The mock/real branching logic is solid.

**However**, switching to real mode requires more than just flipping that flag. Here is everything that must be in place:

---

## Critical Issue: `runAnalysis` is Missing from `analyze.ts`

The scan trigger route (`app/api/scan/trigger/route.ts`) and the background job route (`app/api/jobs/scan/route.ts`) both import `runAnalysis` from `@/lib/analyze`:

```typescript
import { runAnalysis } from "@/lib/analyze";
```

But the current `lib/analyze.ts` only exports `runEnhancedAnalysis` — **not** `runAnalysis`. This means:

- **In mock mode**: This doesn't matter because the scan trigger returns mock data before ever calling `runAnalysis`.
- **In real mode**: The scan trigger will crash with `runAnalysis is not a function` or a build error.

**Fix needed**: Add `export { runEnhancedAnalysis as runAnalysis }` to `lib/analyze.ts`, or rename the function.

---

## Required Environment Variables for Real Mode

| Variable | Purpose | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCK_DATA` | Set to `false` | Manual |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase Dashboard > Settings > API |
| `ANTHROPIC_API_KEY` | Claude API key for analysis | console.anthropic.com |
| `ENCRYPTION_KEY` | 64-char hex string for encrypting stored API keys | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | Your app URL (e.g., `http://localhost:3000`) | Manual |
| `QSTASH_URL` | QStash endpoint for background scans | Upstash Console |
| `QSTASH_TOKEN` | QStash auth token | Upstash Console |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash signature verification | Upstash Console |
| `QSTASH_NEXT_SIGNING_KEY` | QStash signature verification | Upstash Console |

---

## Required Supabase Setup

Before real mode works, you must run the migration SQL (`supabase-migration.sql`) in your Supabase project. This creates the following tables:

- `user_github_tokens` — Stores encrypted GitHub OAuth tokens
- `user_repos` — Stores selected repos per user
- `user_api_keys` — Stores encrypted provider API keys
- `scan_results` — Stores scan history

You also need GitHub OAuth configured in Supabase:
1. Enable GitHub provider in Supabase Auth
2. Create a GitHub OAuth App with the correct callback URL
3. Add `repo`, `read:user`, `user:email` scopes

---

## Real Mode Data Flow (What Actually Happens)

1. User clicks "Connect GitHub" → Supabase OAuth → GitHub → Callback → Token stored encrypted in `user_github_tokens`
2. User goes through onboarding → Selects repos → Stored in `user_repos`
3. User adds provider API keys on Settings/Integrations page → Encrypted and stored in `user_api_keys`
4. Scan trigger reads all of the above from Supabase, decrypts, calls real provider APIs, runs Claude analysis
5. Results saved to `scan_results`

---

## Issues That Will Break in Real Mode

### 1. Missing `runAnalysis` export (CRITICAL)
- `lib/analyze.ts` exports `runEnhancedAnalysis` but both scan routes import `runAnalysis`
- **Fix**: Add alias export

### 2. Anthropic client instantiation at module level (MEDIUM)
- Line 12 of `analyze.ts`: `const client = new Anthropic({ timeout: 120_000 });`
- This runs at import time. If `ANTHROPIC_API_KEY` is not set, it may throw during module load
- **Fix**: Lazy-initialize the client inside `runEnhancedAnalysis`

### 3. QStash background jobs (LOW — only affects scheduled scans)
- `app/api/jobs/scan/route.ts` requires QStash signing keys for verification
- Without QStash configured, manual scans still work but automatic recurring scans won't
- **Fix**: Make QStash optional with graceful fallback

---

## Summary

| What | Status |
|---|---|
| Mock/real flag switching | Works correctly |
| API route branching (mock vs real) | Works correctly |
| Middleware auth bypass | Works correctly |
| Landing page OAuth bypass | Works correctly |
| Provider fetchers (mock vs real) | Works correctly |
| `runAnalysis` export | **BROKEN** — needs fix |
| Anthropic client init | **RISKY** — needs lazy init |
| QStash integration | Optional — only for scheduled scans |
| Database schema | Must be set up manually |
| GitHub OAuth | Must be configured in Supabase |
| Environment variables | 11 variables needed |
