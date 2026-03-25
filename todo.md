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

## Architecture
- [ ] Replace dynamic provider discovery (Claude-for-every-unknown) with hybrid approach:
  - [ ] Build static registry of 50-100 common dev services in JSON
  - [ ] Keep Claude as fallback for truly unknown providers
  - [ ] Cache Claude-discovered providers permanently in DB (never call twice for same service)
