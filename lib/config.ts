// Configuration module for Eagle Eye
// Determines whether to use mock data or real API calls

// Mock mode is enabled when:
// 1. NEXT_PUBLIC_USE_MOCK_DATA is explicitly set to "true", OR
// 2. NEXT_PUBLIC_USE_MOCK_DATA is NOT explicitly set to "false" AND no valid Supabase URL is configured
//    (this means mock mode is ON by default until real credentials are provided)

const hasRealSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://localhost:8000" &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

export const USE_MOCK_DATA =
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" ||
  (process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false" && !hasRealSupabase);

export const MOCK_MODE_ENABLED = USE_MOCK_DATA;

// Environment variables for real API keys (only used if mock mode is disabled)
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Log the current mode on startup (server-side only)
if (typeof window === "undefined") {
  console.log(`[Eagle Eye] Running in ${MOCK_MODE_ENABLED ? "MOCK DATA" : "PRODUCTION"} mode`);
  if (MOCK_MODE_ENABLED) {
    console.log(`[Eagle Eye] To use real data, set NEXT_PUBLIC_USE_MOCK_DATA=false and configure NEXT_PUBLIC_SUPABASE_URL in .env.local`);
  }
}
