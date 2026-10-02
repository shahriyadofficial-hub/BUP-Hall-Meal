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
  };
}

/**
 * GET /api/student/meal-stats
 * Query params: ?userId=...&year=YYYY&month=M (1-12)
 * Fetches verified consumed meal counts for the current calendar month from meal_logs.
 * Explicit rule: Zero-price MVP tally. Absolutely NO monetary amounts or currency symbols.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryUserId = searchParams.get("userId");
    const queryYear = searchParams.get("year");
    const queryMonth = searchParams.get("month");

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

    const bst = getBSTComponents();
    const targetYear = queryYear ? parseInt(queryYear, 10) : bst.year;
    const targetMonth = queryMonth ? parseInt(queryMonth, 10) : bst.month;

    // Calculate start and end date of calendar month in YYYY-MM-DD
    const startOfMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
    const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
    const endOfMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;

    // Query verified consumed meal logs from public.meal_logs
    const { data: logs, error } = await supabaseAdmin
      .from("meal_logs")
      .select("id, meal_type, status, consumed_date")
      .eq("user_id", userId)
      .eq("status", "consumed")
      .gte("consumed_date", startOfMonth)
      .lte("consumed_date", endOfMonth);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const validLogs = logs || [];
    const breakfastCount = validLogs.filter((log) => log.meal_type === "breakfast").length;
    const lunchCount = validLogs.filter((log) => log.meal_type === "lunch").length;
    const dinnerCount = validLogs.filter((log) => log.meal_type === "dinner").length;
    const totalClaimed = validLogs.length;

    return NextResponse.json({
      success: true,
      month: targetMonth,
      year: targetYear,
      dateRange: {
        start: startOfMonth,
        end: endOfMonth,
      },
      stats: {
        totalClaimed,
        breakdown: {
          breakfast: breakfastCount,
          lunch: lunchCount,
          dinner: dinnerCount,
        },
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch meal statistics";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
