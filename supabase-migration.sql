-- Run this in your Supabase SQL editor (Dashboard → SQL editor → New query)

-- 1. GitHub OAuth tokens (captured at login, used by background jobs)
create table if not exists user_github_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  ciphertext    text not null,
  iv            text not null,
  updated_at    timestamptz default now()
);
-- Service role bypasses RLS, no policy needed for background job
-- but block direct client access
alter table user_github_tokens enable row level security;

-- 2. Provider API keys (OpenAI, Stripe, Vercel, Resend, Twilio, domains)
create table if not exists user_api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,
  ciphertext    text not null,
  iv            text not null,
  extra_config  jsonb default '{}',   -- for non-secret config e.g. domain list
  created_at    timestamptz default now(),
  revoked_at    timestamptz,
  unique(user_id, provider)
);
alter table user_api_keys enable row level security;
-- Users can see which providers they have connected (no key values returned)
create policy "users read own key status"
  on user_api_keys for select
  using (auth.uid() = user_id);

-- 3. Cached scan results written by background job
create table if not exists scan_results (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  scanned_at    timestamptz default now(),
  github_data   jsonb default '{}',
  provider_data jsonb default '{}',
  domain_data   jsonb default '[]',
  analysis      jsonb default '{}',
  error         text
);
alter table scan_results enable row level security;
create policy "users read own scan results"
  on scan_results for select
  using (auth.uid() = user_id);

-- 4. Selected repos (currently in localStorage, move here for background jobs)
create table if not exists user_repos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  repo_id       bigint not null,
  full_name     text not null,
  name          text not null,
  private       boolean default false,
  language      text,
  description   text,
  added_at      timestamptz default now(),
  unique(user_id, repo_id)
);
alter table user_repos enable row level security;
create policy "users manage own repos"
  on user_repos for all
  using (auth.uid() = user_id);

-- 5. Provider endpoint maps — cached by discovery engine (shared across all users)
-- Once Eagle Eye discovers endpoints for "stripe", all users benefit from the cache
create table if not exists provider_endpoint_maps (
  id                 uuid primary key default gen_random_uuid(),
  service_id         text not null unique,
  endpoint_map       jsonb not null default '{}',
  discovery_version  int not null default 1,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
alter table provider_endpoint_maps enable row level security;
create policy "public read endpoint maps"
  on provider_endpoint_maps for select
  using (true);
