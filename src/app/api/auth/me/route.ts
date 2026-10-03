import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/me
 * 
 * Fetches the currently authenticated user's profile from public.users,
 * along with their approval status (is_approved).
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    const supabaseAdmin = createSupabaseAdminClient();
    let authUserId: string | null = null;
    let authEmail: string | null = null;

    if (bearerToken) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(bearerToken);
      if (!authError && authData?.user) {
        authUserId = authData.user.id;
        authEmail = authData.user.email || null;
      }
    }

    if (!authUserId) {
      try {
        const supabaseServer = await createSupabaseServerClient();
        const { data: serverAuth } = await supabaseServer.auth.getUser();
        if (serverAuth?.user) {
          authUserId = serverAuth.user.id;
          authEmail = serverAuth.user.email || null;
        }
      } catch {
        // Fallback
      }
    }

    // Support query params ?userId=..., ?phone=..., ?studentId=...
    const { searchParams } = new URL(request.url);
    const queryUserId = searchParams.get("userId");
    const queryPhone = searchParams.get("phone");
    const queryStudentId = searchParams.get("studentId");

    let profile = null;

    if (authUserId || queryUserId) {
      const targetId = authUserId || queryUserId;
      const { data } = await supabaseAdmin
        .from("users")
        .select("id, student_id, full_name, email, department, blood_group, session, hall, room_number, phone_number, phone_verified, role, profile_photo_url, is_approved, created_at")
        .eq("id", targetId!)
        .maybeSingle();
      profile = data;
    } else if (queryPhone) {
      const { normalizePhoneNumber } = await import("@/lib/auth-pin");
      const normalized = normalizePhoneNumber(queryPhone);
      const { data } = await supabaseAdmin
        .from("users")
        .select("id, student_id, full_name, email, department, blood_group, session, hall, room_number, phone_number, phone_verified, role, profile_photo_url, is_approved, created_at")
        .eq("phone_number", normalized)
        .maybeSingle();
      profile = data;
    } else if (queryStudentId) {
      const { data } = await supabaseAdmin
        .from("users")
        .select("id, student_id, full_name, email, department, blood_group, session, hall, room_number, phone_number, phone_verified, role, profile_photo_url, is_approved, created_at")
        .eq("student_id", queryStudentId.trim())
        .maybeSingle();
      profile = data;
    }

    if (!profile) {
      return NextResponse.json(
        { authenticated: Boolean(authUserId), user: null, profile: null, isApproved: false, hasCompletedOnboarding: false },
        { status: 200 }
      );
    }

    // Auto-approve users with official BUP edu emails if previously unapproved
    const { isBUPEduEmail } = await import("@/lib/auth-utils");
    if (!profile.is_approved && isBUPEduEmail(profile.email)) {
      await supabaseAdmin.from("users").update({ is_approved: true }).eq("id", profile.id);
      profile.is_approved = true;
    }

    return NextResponse.json({
      authenticated: true,
      authUserId: profile.id,
      authEmail: profile.email,
      profile,
      isApproved: profile.is_approved ?? false,
      hasCompletedOnboarding: Boolean(profile.student_id && profile.room_number),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch user state";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
