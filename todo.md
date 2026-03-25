# Eagle Eye — Fix Tracker

## Critical Security
- [x] Add auth guard to /api/integrations/fetch (unauthenticated endpoint)
- [x] Add auth guard to /api/analyze (unauthenticated endpoint — Anthropic cost exposure)

## High Bugs
- [x] Fix wrong Claude model name in /api/analyze (claude-opus-4-6 → claude-3-5-sonnet-20241022)
- [x] Fix mock mode silent fallback — show error if Supabase env vars missing in production
- [x] Fix auth callback always redirecting returning users to /onboarding

## Medium UX
- [x] Remove manual "Key expires on" date field from integrations page
- [x] Add TTL to scan cache (already implemented — 5 min TTL confirmed in scan-cache.ts)
- [x] Add empty state on dashboard when no repos/scan data

## User LLM Key (Bring Your Own Key)
- [ ] Add LLM provider section to integrations page (OpenAI / Anthropic / Gemini key input)
- [ ] Update key storage API to handle llm_openai, llm_anthropic, llm_gemini provider types
- [ ] Rewrite /api/analyze to use user's stored LLM key instead of server env var
- [ ] Multi-provider routing: OpenAI → gpt-4o-mini, Anthropic → claude-3-5-sonnet, Gemini → gemini-1.5-flash
- [ ] Show "Add LLM key to enable AI insights" prompt on dashboard when no LLM key configured

## Architecture
- [x] Replace dynamic provider discovery with hybrid approach:
  - [x] Built static registry of 80+ common dev services in provider-registry.json
  - [x] Generic credential inference fallback for truly unknown providers (no LLM cost)
  - [x] dynamic-providers.ts rewritten to use static registry as primary lookup
