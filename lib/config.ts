// Configuration module for Eagle Eye
// Determines whether to use mock data or real API calls

export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" || process.env.NODE_ENV === "development";

export const MOCK_MODE_ENABLED = USE_MOCK_DATA;

// Environment variables for real API keys (only used if mock mode is disabled)
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Log the current mode on startup
if (typeof window === "undefined") {
  console.log(`[Eagle Eye] Running in ${MOCK_MODE_ENABLED ? "MOCK DATA" : "PRODUCTION"} mode`);
}
