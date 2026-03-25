# Eagle Eye — Project TODO

## Core Vision
Build a fully dynamic infrastructure monitoring tool. No hardcoded provider connectors.
The LLM discovers API endpoints automatically for any service. Users add a key — Eagle Eye figures out the rest.

---

## Phase 1 — Dynamic Discovery Engine
- [x] Build LLM-powered endpoint discovery: given a service name + credentials, LLM fetches docs, identifies monitoring-relevant endpoints (usage, billing, health, limits, quotas)
- [x] Endpoint verification layer: call every discovered endpoint with user's key, keep only those that return 200 + real data
- [x] Save verified endpoint map to database per provider (reuse for all future users of same service) — `lib/endpoint-store.ts`
- [x] Community sharing via `provider_endpoint_maps` table — once one user discovers a service, all users benefit
- [x] Add web search tool to discovery agent so it reads actual live API documentation (currently uses LLM training knowledge)
- [x] Add HTML-to-text stripper so LLM reads clean readable docs, not raw HTML
- [x] Add multi-page doc crawl: follow relevant links (e.g. /reference, /api, /endpoints)
- [x] Add last_verified_at to provider_endpoint_maps table + auto-refresh after 30 days
- [x] Add docs_url field to endpoint map so we know where endpoints were sourced from

## Phase 2 — Failure Detection
- [x] Loud credential failure alerts: 401/403 responses trigger `_credentialError` flag + red banner on dashboard
- [x] Soft error detection: full raw response bodies passed to LLM — catches "quota_exceeded: true" inside 200 responses
- [x] Two alert tiers: "Key broken" (hard error, red) vs "Limit approaching" (soft warning, amber)
- [ ] Coverage scoring: show user how many endpoints returned useful data vs empty responses

## Phase 3 — Local Testing with Ollama
- [x] Add Ollama as LLM provider option in integrations page (`llm_ollama`)
- [x] `callLLM` in `analyze.ts` supports Ollama via OpenAI-compatible API
- [x] Discovery engine supports Ollama provider
- [x] Scan trigger handles Ollama key (URL as the key value)
- [ ] Document local setup: ollama install + pull model + set env vars

## Phase 4 — Per-Provider Grouped Summaries & Dashboard
- [x] `summarizeProviderData` function — LLM extracts grouped structured output per provider
- [x] Groups: health / usage / billing / limits / warnings
- [x] `DynamicProviderCard` component — renders grouped data as clean card rows
- [x] "Service Intelligence" section on dashboard — shows all LLM-discovered providers
- [x] Credential error state on cards — clear "Update key in Integrations" message
- [x] Status indicator per provider: good / warn / critical / credential_error
- [x] `providers-dynamic.ts` — orchestrates known + unknown providers, attaches `_providerSummary`

## Phase 5 — Quality & Launch Readiness
- [ ] Run Supabase migration SQL in production (`supabase-migration.sql`)
- [ ] Set `ENCRYPTION_KEY` in Vercel environment variables
- [ ] Set `NEXT_PUBLIC_USE_MOCK_DATA=false` in Vercel
- [ ] End-to-end test with real API keys (OpenAI, Stripe, Supabase minimum)
- [ ] Test dynamic discovery with at least one unknown provider (e.g., PlanetScale, Neon)
- [ ] Test Ollama local flow
- [ ] Add `pom.xml` and `build.gradle` to `detect.ts` for Java/Maven support
- [x] Add web search capability to discovery agent (live docs fetching implemented)
- [ ] HN launch post preparation

---

## Already Done (Pre-session)
- [x] Auth guard on all API routes
- [x] GitHub OAuth via Supabase
- [x] GitHub repo scanning + provider detection (package.json, requirements.txt, go.mod, Gemfile)
- [x] Dashboard UI with scan results
- [x] Scan cache with TTL
- [x] Empty state on dashboard
- [x] Domain expiry monitoring
- [x] Mock mode for development
- [x] QStash background scan jobs
- [x] Fix endpoint filtering: remove pre-filter from discovery, collect ALL GET endpoints from docs, let verifyAndFetch be the real gate, cache only verified endpoints
