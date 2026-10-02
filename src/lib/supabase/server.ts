import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase Server Client Helpers for Next.js 15 App Router
 * 
 * Supports:
 * - Server Components, Server Actions, and Route Handlers
 * - Session forwarding via Next.js 15 async cookies()
 * - Privileged Admin Service Role client for counter verification and backend RPCs
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

/**
 * Creates a server-side Supabase client authenticated with the user's active session cookie
 * Suitable for Server Components and Server Actions respecting Row Level Security (RLS).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  
  // Extract Supabase auth token from cookies if present
  const authToken = cookieStore.get("sb-access-token")?.value || "";

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {},
    },
  });
}

/**
 * Creates a privileged Supabase Service Role client
 * 
 * IMPORTANT:
 * - NEVER expose this client to the browser.
 * - Used exclusively in secure Edge Functions / Route Handlers (e.g. POST /api/v1/counter/verify)
 * - Bypasses RLS to fetch TOTP secrets, verify dining PIN hashes, and commit counter meal logs.
 */
export function createSupabaseAdminClient() {
  if (!supabaseServiceRoleKey && process.env.NODE_ENV === "development") {
    console.warn(
      "[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY is not defined. Privileged backend operations will fail."
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
