import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { MealType, CounterVerificationRequest, CounterVerificationResponse, DynamicQRPayload } from "@/types";
import { sendMealPushAlert } from "@/lib/notifications";

/**
 * Helper to get current Bangladesh Standard Time (BST, UTC+6) components
 */
function getBSTComponents(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const find = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  return {
    year: parseInt(find("year"), 10),
    month: parseInt(find("month"), 10),
    day: parseInt(find("day"), 10),
    hour: parseInt(find("hour"), 10),
    minute: parseInt(find("minute"), 10),
    second: parseInt(find("second"), 10),
  };
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * POST /api/counter/verify
 * Handles both QR code scanning and Dead-battery PIN fallback verification.
 */
export async function POST(request: NextRequest) {
  try {
    const body: CounterVerificationRequest & {
      user_id?: string;
      student_id?: string;
      totp?: string;
      ts?: number;
    } = await request.json();

    const { mode, meal_type, qr_payload, fallback_data } = body;

    let studentId = "";
    let studentUid = body.user_id || "";

    // 1. Extract identification based on mode
    if (mode === "pin") {
      studentId = fallback_data?.student_id || body.student_id || "";
    } else {
      // mode === 'qr' or direct serial confirmation
      if (qr_payload) {
        try {
          // Attempt Base64 decode or direct JSON
          let decodedStr = qr_payload;
          try {
            decodedStr = atob(qr_payload.trim());
          } catch {
            // direct JSON string
          }
          const parsed = JSON.parse(decodedStr) as DynamicQRPayload;
          studentId = parsed.sid || "";
          studentUid = parsed.uid || studentUid;
        } catch {
          studentId = body.student_id || "";
        }
      } else if (body.student_id) {
        studentId = body.student_id;
      }
    }

    if (!studentId && !studentUid) {
      return NextResponse.json<CounterVerificationResponse>(
        {
          success: false,
          error: "invalid_payload: Missing Student ID or QR Payload",
        },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const bst = getBSTComponents();
    const todayStr = formatDate(bst.year, bst.month, bst.day);
    const nowIso = new Date().toISOString();

    // 2. Fetch student user profile
    let query = supabaseAdmin.from("users").select("*");
    if (studentUid && studentId) {
      query = query.or(`id.eq.${studentUid},student_id.eq.${studentId}`);
    } else if (studentUid) {
      query = query.eq("id", studentUid);
    } else {
      query = query.eq("student_id", studentId);
    }

    const { data: user, error: userError } = await query.maybeSingle();

    if (userError || !user) {
      return NextResponse.json<CounterVerificationResponse>(
        {
          success: false,
          error: "student_not_found: No registered student matches the provided ID",
        },
        { status: 404 }
      );
    }

    // 3. Check for Duplicate Claim in public.meal_logs
    const { data: existingLogs, error: logError } = await supabaseAdmin
      .from("meal_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("consumed_date", todayStr)
      .eq("meal_type", meal_type || "lunch");

    if (existingLogs && existingLogs.length > 0) {
      const priorLog = existingLogs[0];
      return NextResponse.json<CounterVerificationResponse>(
        {
          success: false,
          error: "already_claimed",
          claimed_at: priorLog.consumed_at || priorLog.created_at || nowIso,
          data: {
            log_id: priorLog.id,
            student_id: user.student_id,
            full_name: user.full_name,
            hall: user.hall,
            room_number: user.room_number,
            profile_photo_url: user.profile_photo_url,
            claimed_at: priorLog.consumed_at || priorLog.created_at || nowIso,
            meal_type: meal_type || "lunch",
          },
        },
        { status: 409 }
      );
    }

    // 4. Record new meal consumption
    const newLogRecord = {
      user_id: user.id,
      consumed_date: todayStr,
      meal_date: todayStr,
      meal_type: meal_type || "lunch",
      status: "consumed",
      method: mode === "pin" ? "pin_fallback" : "qr_scan",
      consumed_at: nowIso,
      claimed_at: nowIso,
    };

    let { data: insertedLog, error: insertError } = await supabaseAdmin
      .from("meal_logs")
      .insert(newLogRecord)
      .select()
      .maybeSingle();

    if (insertError) {
      // Fallback: try inserting without extra columns if older table structure
      const baseRecord = {
        user_id: user.id,
        meal_type: meal_type || "lunch",
        status: "consumed",
      };
      const fallbackResult = await supabaseAdmin
        .from("meal_logs")
        .insert(baseRecord)
        .select()
        .maybeSingle();
      insertedLog = fallbackResult.data;
    }

    const logId = insertedLog?.id || crypto.randomUUID();

    // 5. Fire background FCM Web Push Notification to student's mobile device
    sendMealPushAlert(user.id, meal_type || "lunch").catch((err) => {
      console.warn("[Counter Verify API] Push alert failed:", err);
    });

    // 6. Successful Verification
    return NextResponse.json<CounterVerificationResponse>(
      {
        success: true,
        data: {
          log_id: logId,
          student_id: user.student_id,
          full_name: user.full_name,
          hall: user.hall,
          room_number: user.room_number,
          profile_photo_url: user.profile_photo_url,
          claimed_at: nowIso,
          meal_type: meal_type || "lunch",
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Counter verification failed";
    return NextResponse.json<CounterVerificationResponse>(
      {
        success: false,
        error: `internal_error: ${errorMsg}`,
      },
      { status: 500 }
    );
  }
}
