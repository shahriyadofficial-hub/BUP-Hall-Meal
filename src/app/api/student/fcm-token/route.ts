import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/student/fcm-token
 * Body: { userId, fcmToken }
 * Saves or updates student's Firebase Cloud Messaging token in public.users
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, fcmToken } = body;

    if (!userId || !fcmToken) {
      return NextResponse.json(
        { error: "Missing required fields: userId, fcmToken" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ fcm_token: fcmToken, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, student_id, fcm_token")
      .maybeSingle();

    if (error) {
      console.error("[FCM Token API] Database update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "FCM token saved successfully",
      data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save FCM token";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
