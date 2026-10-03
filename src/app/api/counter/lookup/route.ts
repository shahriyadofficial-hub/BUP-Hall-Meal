import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { MealType, DynamicQRPayload } from "@/types";
import { normalizeHallSerial, formatHallSerial } from "@/lib/hall-serial";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("query")?.trim() || "";
    const requestedMeal = (searchParams.get("meal_type") || "lunch") as MealType;

    if (!rawQuery) {
      return NextResponse.json(
        { success: false, error: "Missing search query" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();
    let studentId = "";
    let studentUid = "";
    let serialNum: number | null = null;

    // Check if query is QR Payload (base64 or json)
    if (rawQuery.startsWith("{") || rawQuery.includes("sid") || rawQuery.length > 25) {
      let decodedStr = rawQuery;
      try {
        decodedStr = atob(rawQuery);
      } catch {
        // raw json
      }
      try {
        const parsed = JSON.parse(decodedStr) as DynamicQRPayload;
        studentId = parsed.sid || "";
        studentUid = parsed.uid || "";
      } catch {
        // not QR json, check if raw string
      }
    }

    const cleanedSerial = normalizeHallSerial(rawQuery);
    if (!isNaN(Number(cleanedSerial)) && Number(cleanedSerial) > 0) {
      serialNum = Number(cleanedSerial);
    }

    // Try finding the student
    let user = null;

    // 1. Direct UUID or student_id from QR
    if (studentUid) {
      const { data } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("id", studentUid)
        .maybeSingle();
      if (data) user = data;
    }

    if (!user && studentId) {
      const { data } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("student_id", studentId)
        .maybeSingle();
      if (data) user = data;
    }

    // 2. Query as Short Serial
    if (!user && serialNum !== null) {
      // Check hall_serial column if populated
      try {
        const { data } = await supabaseAdmin
          .from("users")
          .select("*")
          .eq("hall_serial", serialNum)
          .maybeSingle();
        if (data) user = data;
      } catch {
        // column may not exist in older table, fallback below
      }

      // Check student ID ending with serial
      if (!user) {
        const paddedDigits = String(serialNum).padStart(3, "0");
        const { data: matchedUsers } = await supabaseAdmin
          .from("users")
          .select("*")
          .or(`student_id.ilike.%${paddedDigits},student_id.ilike.%${serialNum}`)
          .limit(5);

        if (matchedUsers && matchedUsers.length > 0) {
          user = matchedUsers[0];
        }
      }
    }

    // 3. Fallback: match by student_id or email
    if (!user) {
      const { data } = await supabaseAdmin
        .from("users")
        .select("*")
        .or(`student_id.eq.${rawQuery},email.eq.${rawQuery}`)
        .maybeSingle();
      if (data) user = data;
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "student_not_found",
          message: `কোনো শিক্ষার্থী পাওয়া যায়নি (Serial / ID: ${rawQuery})`,
        },
        { status: 404 }
      );
    }

    // Determine Today's BST Date
    const bst = getBSTComponents();
    const todayStr = formatDate(bst.year, bst.month, bst.day);

    // Check today's meal booking in meal_bookings
    const { data: booking } = await supabaseAdmin
      .from("meal_bookings")
      .select("*")
      .eq("user_id", user.id)
      .eq("booking_date", todayStr)
      .maybeSingle();

    const isBooked = Boolean(booking && booking[requestedMeal]);

    // Check today's consumption in meal_logs
    const { data: logs } = await supabaseAdmin
      .from("meal_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("consumed_date", todayStr)
      .eq("meal_type", requestedMeal)
      .limit(1);

    const isConsumed = Boolean(logs && logs.length > 0);
    const consumedLog = isConsumed && logs ? logs[0] : null;

    let mealStatus: "booked" | "already_consumed" | "not_booked" = "not_booked";
    if (isConsumed) {
      mealStatus = "already_consumed";
    } else if (isBooked) {
      mealStatus = "booked";
    }

    return NextResponse.json({
      success: true,
      student: {
        id: user.id,
        student_id: user.student_id,
        full_name: user.full_name,
        avatar_url: user.avatar_url || user.profile_photo_url || null,
        profile_photo_url: user.profile_photo_url || user.avatar_url || null,
        department: user.department || "BUP Student",
        room_number: user.room_number || "N/A",
        hall: user.hall || "male",
        hall_serial: formatHallSerial(user.hall_serial, user.student_id),
        meal_status: mealStatus,
        is_booked: isBooked,
        consumed_at: consumedLog?.consumed_at || consumedLog?.created_at || null,
        booking_date: todayStr,
        meal_type: requestedMeal,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Counter lookup failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
