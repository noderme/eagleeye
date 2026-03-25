// Configuration module for Eagle Eye
// Determines whether to use mock data or real API calls

// Mock mode is enabled ONLY when explicitly set to "true"
// In production, if Supabase credentials are missing, we throw a clear error
// rather than silently falling back to mock data (which would show fake data to real users)

const hasRealSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://localhost:8000" &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

const explicitMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
const explicitReal = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false";

// In production (NODE_ENV=production), never silently fall back to mock mode
// If Supabase is not configured and mock is not explicitly enabled, throw a clear error
if (
  typeof window === "undefined" &&
  process.env.NODE_ENV === "production" &&
  !explicitMock &&
  !hasRealSupabase
) {
  throw new Error(
    "[Eagle Eye] CONFIGURATION ERROR: Running in production but NEXT_PUBLIC_SUPABASE_URL is not set. " +
    "Set NEXT_PUBLIC_USE_MOCK_DATA=true to use mock data, or configure a real Supabase project."
  );
}

export const USE_MOCK_DATA =
  explicitMock || (!explicitReal && !hasRealSupabase);

export const MOCK_MODE_ENABLED = USE_MOCK_DATA;

// Environment variables for real API keys (only used if mock mode is disabled)
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Log the current mode on startup (server-side only)
if (typeof window === "undefined") {
  console.log(`[Eagle Eye] Running in ${MOCK_MODE_ENABLED ? "MOCK DATA" : "PRODUCTION"} mode`);
  if (MOCK_MODE_ENABLED && process.env.NODE_ENV !== "production") {
    console.log(`[Eagle Eye] To use real data, set NEXT_PUBLIC_USE_MOCK_DATA=false and configure NEXT_PUBLIC_SUPABASE_URL in .env.local`);
  }
}
