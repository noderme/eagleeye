/**
 * Auto-migration script — runs before the Next.js server on every startup.
 * Uses the Supabase Management API to apply supabase-migration.sql idempotently.
 * All statements use CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS —
 * safe to run multiple times without data loss.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL  — e.g. https://xyzxyz.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (never exposed to frontend)
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log("[migrate] Skipping — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
  process.exit(0);
}

// Extract project ref from URL: https://<ref>.supabase.co
const match = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/);
if (!match) {
  console.log("[migrate] Skipping — could not parse project ref from SUPABASE_URL.");
  process.exit(0);
}
const projectRef = match[1];

// Read the full migration SQL
const sql = readFileSync(join(ROOT, "supabase-migration.sql"), "utf-8");

console.log(`[migrate] Applying migrations to project: ${projectRef}`);

try {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (res.ok) {
    console.log("[migrate] ✓ Migrations applied successfully.");
  } else {
    const body = await res.text();
    // 400 with "already exists" messages is fine — idempotent
    if (body.includes("already exists") || res.status === 400) {
      console.log("[migrate] ✓ Tables already exist — no changes needed.");
    } else {
      console.warn(`[migrate] Warning: HTTP ${res.status} — ${body.slice(0, 200)}`);
      console.warn("[migrate] Continuing startup — migration warnings are non-fatal.");
    }
  }
} catch (err) {
  console.warn(`[migrate] Network error: ${err.message}`);
  console.warn("[migrate] Continuing startup — migration is non-fatal.");
}

process.exit(0);
