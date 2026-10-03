import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { extractStudentIdFromEmail } from "@/lib/auth-utils";

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
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin)
      );
    }

    // Retrieve active authenticated user from the exchanged session
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const supabaseAdmin = createSupabaseAdminClient();

      // Check if user exists in public.users
      const { data: profile } = await supabaseAdmin
        .from("users")
        .select("id, student_id, role, is_approved, is_onboarded, room_number")
        .eq("id", user.id)
        .maybeSingle();

      let isCompleteProfile = false;

      if (!profile) {
        // User not found in public.users: insert a preliminary record
        // pulling email, full_name, and avatar_url from Google user metadata
        const meta = user.user_metadata || {};
        const fullName = meta.full_name || meta.name || meta.given_name || "Student";
        const avatarUrl = meta.avatar_url || meta.picture || null;
        const cleanEmail = user.email?.trim().toLowerCase() || "";
        const extractedId = extractStudentIdFromEmail(cleanEmail);
        const studentId = extractedId || `PENDING-${user.id.slice(0, 8)}`;
        const totpSecret = crypto.randomBytes(20).toString("hex");
        const loginType = cleanEmail.endsWith("bup.edu.bd") ? "bup_edu" : "personal_gmail";

        const preliminaryRecord = {
          id: user.id,
          student_id: studentId,
          full_name: fullName,
          email: cleanEmail,
          hall: "male",
          room_number: "PENDING",
          phone_number: "01700000000",
          dining_pin_hash: "pending",
          totp_secret: totpSecret,
          role: "student",
          is_approved: true,
          is_onboarded: false,
          auth_provider: "google",
          avatar_url: avatarUrl,
          profile_photo_url: avatarUrl,
          login_type: loginType,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: insertError } = await supabaseAdmin
          .from("users")
          .insert(preliminaryRecord);

        if (insertError) {
          console.warn("[Auth Callback] User insert warning:", insertError.message);
        }
        isCompleteProfile = false;
      } else {
        // User exists: verify if profile setup has been completed
        isCompleteProfile = Boolean(
          profile.is_onboarded &&
          profile.student_id &&
          !profile.student_id.startsWith("PENDING") &&
          profile.room_number &&
          profile.room_number !== "PENDING"
        );
      }

      // If is_onboarded is false, redirect to /auth/profile-setup
      if (!isCompleteProfile) {
        return NextResponse.redirect(new URL("/auth/profile-setup", requestUrl.origin));
      }

      // If true, redirect to their role home page
      const userRole = profile?.role;
      if (userRole === "admin") {
        return NextResponse.redirect(new URL("/admin/users", requestUrl.origin));
      }
      if (userRole === "counter" || userRole === "staff" || userRole === "manager") {
        return NextResponse.redirect(new URL("/counter", requestUrl.origin));
      }

      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Fallback to login if no code or user
  return NextResponse.redirect(new URL("/auth/login", requestUrl.origin));
}
