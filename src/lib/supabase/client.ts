import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Browser Client
 * 
 * Used inside Client Components ('use client') for:
 * - Realtime subscriptions (e.g. meal claim alerts)
 * - Client-side authentication sessions
 * - Dynamic QR token queries
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  // Helpful developer guidance in local development
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables."
    );
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
