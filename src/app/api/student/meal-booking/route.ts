import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

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

/**
 * Format YYYY-MM-DD
 */
function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * GET /api/student/meal-booking
 * Query params: ?userId=...&date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryUserId = searchParams.get("userId");
    const queryDate = searchParams.get("date");

    const supabaseAdmin = createSupabaseAdminClient();
    let userId = queryUserId;

    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
      if (bearerToken) {
        const { data: authData } = await supabaseAdmin.auth.getUser(bearerToken);
        userId = authData?.user?.id || null;
      }
    }

    if (!userId) {
      try {
        const supabaseServer = await createSupabaseServerClient();
        const { data: serverAuth } = await supabaseServer.auth.getUser();
        userId = serverAuth?.user?.id || null;
      } catch {
        // Fallback
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized: Missing user identity" }, { status: 401 });
    }

    // Default to today and tomorrow if no date specified
    const bst = getBSTComponents();
    const todayStr = formatDate(bst.year, bst.month, bst.day);
    const tomorrowDate = new Date(Date.UTC(bst.year, bst.month - 1, bst.day + 1));
    const tomorrowStr = formatDate(
      tomorrowDate.getUTCFullYear(),
      tomorrowDate.getUTCMonth() + 1,
      tomorrowDate.getUTCDate()
    );

    const targetDate = queryDate || tomorrowStr;

    // Fetch booking for target date
    const { data: booking, error } = await supabaseAdmin
      .from("meal_bookings")
      .select("*")
      .eq("user_id", userId)
      .eq("booking_date", targetDate)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch today's booking as well
    const { data: todayBooking } = await supabaseAdmin
      .from("meal_bookings")
      .select("*")
      .eq("user_id", userId)
      .eq("booking_date", todayStr)
      .maybeSingle();

    // Fetch today's consumed logs as well
    const { data: todayLogs } = await supabaseAdmin
      .from("meal_logs")
      .select("id, meal_type, consumed_at, created_at")
      .eq("user_id", userId)
      .eq("consumed_date", todayStr);

    const todayConsumed: {
      breakfast: boolean;
      lunch: boolean;
      dinner: boolean;
      consumedAt: { breakfast?: string; lunch?: string; dinner?: string };
    } = {
      breakfast: false,
      lunch: false,
      dinner: false,
      consumedAt: {},
    };

    if (todayLogs && todayLogs.length > 0) {
      for (const log of todayLogs) {
        const type = log.meal_type as "breakfast" | "lunch" | "dinner";
        if (type === "breakfast" || type === "lunch" || type === "dinner") {
          todayConsumed[type] = true;
          todayConsumed.consumedAt[type] = log.consumed_at || log.created_at;
        }
      }
    }

    const isCutoffPassed = bst.hour >= 22; // 10:00 PM BST cutoff

    return NextResponse.json({
      success: true,
      booking: booking || {
        user_id: userId,
        booking_date: targetDate,
        breakfast: false,
        lunch: false,
        dinner: false,
      },
      todayBooking: todayBooking || {
        user_id: userId,
        booking_date: todayStr,
        breakfast: false,
        lunch: false,
        dinner: false,
      },
      todayConsumed,
      dates: {
        today: todayStr,
        tomorrow: tomorrowStr,
      },
      cutoff: {
        isCutoffPassed,
        currentBstHour: bst.hour,
        currentBstMinute: bst.minute,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch meal booking";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/student/meal-booking
 * Body: { userId, bookingDate, breakfast, lunch, dinner }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, bookingDate, breakfast, lunch, dinner } = body;

    if (!userId || !bookingDate) {
      return NextResponse.json({ error: "Missing required fields: userId, bookingDate" }, { status: 400 });
    }

    const bst = getBSTComponents();
    const todayStr = formatDate(bst.year, bst.month, bst.day);
    const tomorrowDate = new Date(Date.UTC(bst.year, bst.month - 1, bst.day + 1));
    const tomorrowStr = formatDate(
      tomorrowDate.getUTCFullYear(),
      tomorrowDate.getUTCMonth() + 1,
      tomorrowDate.getUTCDate()
    );

    // Enforce 10:00 PM BST cutoff for tomorrow's bookings
    // Visible cutoff is 22:00:00 (10:00 PM), backend hard grace limit is 22:10:00 (10:10 PM)
    if (bookingDate === tomorrowStr) {
      const isPastVisibleCutoff = bst.hour > 22 || (bst.hour === 22 && bst.minute >= 10);
      if (isPastVisibleCutoff) {
        return NextResponse.json(
          {
            error: "BOOKING_WINDOW_CLOSED",
            messageBn: "আগামীকালের মিল বুকিং সময়সীমা শেষ হয়েছে (রাত ১০:০০ টা)।",
            messageEn: "Booking window for tomorrow's meals closed at 10:00 PM BST.",
          },
          { status: 423 } // 423 Locked
        );
      }
    } else if (bookingDate <= todayStr) {
      // Disallow booking for today or past dates
      return NextResponse.json(
        {
          error: "PAST_OR_SAME_DAY_LOCKED",
          messageBn: "আজকের বা পূর্ববর্তী দিনের মিল পরিবর্তন সম্ভব নয়।",
          messageEn: "Modifications for today's or past meals are not permitted.",
        },
        { status: 423 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();

    // Upsert meal booking
    const { data: upserted, error } = await supabaseAdmin
      .from("meal_bookings")
      .upsert(
        {
          user_id: userId,
          booking_date: bookingDate,
          breakfast: Boolean(breakfast),
          lunch: Boolean(lunch),
          dinner: Boolean(dinner),
        },
        { onConflict: "user_id,booking_date" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      booking: upserted,
      messageBn: "মিল বুকিং সফলভাবে হালনাগাদ করা হয়েছে।",
      messageEn: "Meal booking updated successfully.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update meal booking";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
