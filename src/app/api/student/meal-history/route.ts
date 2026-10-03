import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month") || ""; // Format: YYYY-MM
    let targetUserId = searchParams.get("userId") || "";

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      targetUserId = user.id;
    }

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();

    // Determine target month range (UTC / Asia/Dhaka)
    let startDate: string;
    let endDate: string;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split("-").map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    } else {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    }

    // Query meal_logs for this student
    const { data: logs, error } = await supabaseAdmin
      .from("meal_logs")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Normalize and filter by month range
    const filteredLogs = (logs || [])
      .map((log) => {
        const dateStr = log.meal_date || log.consumed_date || log.created_at?.split("T")[0] || "";
        const claimTime = log.claimed_at || log.consumed_at || log.created_at;

        return {
          id: log.id,
          date: dateStr,
          meal_type: log.meal_type as "breakfast" | "lunch" | "dinner",
          status: log.status || "consumed",
          claimed_at: claimTime,
          created_at: log.created_at,
        };
      })
      .filter((log) => {
        if (!log.date) return false;
        return log.date >= startDate && log.date <= endDate;
      });

    // Calculate monthly stats
    const stats = {
      totalMeals: filteredLogs.filter((l) => l.status === "consumed" || l.status === "booked").length,
      consumedCount: filteredLogs.filter((l) => l.status === "consumed").length,
      breakfastCount: filteredLogs.filter((l) => l.meal_type === "breakfast").length,
      lunchCount: filteredLogs.filter((l) => l.meal_type === "lunch").length,
      dinnerCount: filteredLogs.filter((l) => l.meal_type === "dinner").length,
    };

    return NextResponse.json({
      success: true,
      month: monthParam || `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`,
      stats,
      meals: filteredLogs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load meal history";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
