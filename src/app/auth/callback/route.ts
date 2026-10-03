import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 * Universal Google OAuth & magic link callback handler.
 * Exchanges the code for a Supabase session and routes the user based on profile completeness.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/student/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[Auth Callback] Code exchange error:", exchangeError.message);
      return NextResponse.redirect(new URL(`/auth/login?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin));
    }

    // Retrieve active authenticated user
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const supabaseAdmin = createSupabaseAdminClient();

      // Check if user has an existing complete profile in public.users
      const { data: profile } = await supabaseAdmin
        .from("users")
        .select("id, student_id, role, is_approved")
        .eq("id", user.id)
        .maybeSingle();

      // If user profile is not set up or student_id is missing, route to profile setup
      if (!profile || !profile.student_id) {
        return NextResponse.redirect(new URL("/auth/profile-setup", requestUrl.origin));
      }

      // Role-based routing for existing students/staff/admin
      if (profile.role === "admin") {
        return NextResponse.redirect(new URL("/admin/users", requestUrl.origin));
      }
      if (profile.role === "staff" || profile.role === "manager") {
        return NextResponse.redirect(new URL("/counter", requestUrl.origin));
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Fallback to login if no code was provided
  return NextResponse.redirect(new URL("/auth/login", requestUrl.origin));
}
