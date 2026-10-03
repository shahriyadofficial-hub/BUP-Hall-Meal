import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month") || ""; // Format: YYYY-MM
    const dateParam = searchParams.get("date") || "";   // Format: YYYY-MM-DD
    const mealTypeParam = searchParams.get("meal_type") || "all";
    const searchQuery = searchParams.get("search")?.trim().toLowerCase() || "";

    const supabaseAdmin = createSupabaseAdminClient();

    // Determine target month range
    let startDate: string;
    let endDate: string;

    if (dateParam) {
      startDate = dateParam;
      endDate = dateParam;
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [year, month] = monthParam.split("-").map(Number);
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0)); // last day of month
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    } else {
      // Default to current BST month
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      startDate = start.toISOString().split("T")[0];
      endDate = end.toISOString().split("T")[0];
    }

    // Query meal_logs within date range
    let query = supabaseAdmin
      .from("meal_logs")
      .select("*, users(id, student_id, full_name, hall_serial, room_number, hall, department)")
      .order("created_at", { ascending: false });

    if (dateParam) {
      query = query.or(`meal_date.eq.${dateParam},consumed_date.eq.${dateParam}`);
    } else {
      query = query.gte("meal_date", startDate).lte("meal_date", endDate);
    }

    if (mealTypeParam !== "all") {
      query = query.eq("meal_type", mealTypeParam);
    }

    const { data: logs, error } = await query;

    if (error) {
      // Fallback: try querying without users join if relation not configured in Postgres schema
      const { data: fallbackLogs, error: fallbackError } = await supabaseAdmin
        .from("meal_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (fallbackError) {
        return NextResponse.json({ success: false, error: fallbackError.message }, { status: 500 });
      }

      // Fetch users manually
      const userIds = Array.from(new Set((fallbackLogs || []).map((l) => l.user_id).filter(Boolean)));
      let usersMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabaseAdmin
          .from("users")
          .select("id, student_id, full_name, hall_serial, room_number, hall, department")
          .in("id", userIds);

        if (usersData) {
          usersData.forEach((u) => {
            usersMap[u.id] = u;
          });
        }
      }

      const combined = (fallbackLogs || [])
        .map((log) => ({
          ...log,
          users: usersMap[log.user_id] || null,
        }))
        .filter((item) => {
          if (!searchQuery) return true;
          const u = item.users;
          return (
            u?.full_name?.toLowerCase().includes(searchQuery) ||
            u?.student_id?.toLowerCase().includes(searchQuery) ||
            String(u?.hall_serial).includes(searchQuery)
          );
        });

      return NextResponse.json({
        success: true,
        logs: combined,
        stats: calculateStats(combined),
      });
    }

    // Filter by search query if provided
    const filtered = (logs || []).filter((item: any) => {
      if (!searchQuery) return true;
      const u = item.users;
      return (
        u?.full_name?.toLowerCase().includes(searchQuery) ||
        u?.student_id?.toLowerCase().includes(searchQuery) ||
        String(u?.hall_serial).includes(searchQuery)
      );
    });

    return NextResponse.json({
      success: true,
      logs: filtered,
      stats: calculateStats(filtered),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load meal logs";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

function calculateStats(logs: any[]) {
  let breakfast = 0;
  let lunch = 0;
  let dinner = 0;
  let consumed = 0;
  const uniqueStudents = new Set<string>();

  logs.forEach((log) => {
    if (log.meal_type === "breakfast") breakfast++;
    if (log.meal_type === "lunch") lunch++;
    if (log.meal_type === "dinner") dinner++;
    if (log.status === "consumed") consumed++;
    if (log.user_id) uniqueStudents.add(log.user_id);
  });

  return {
    total: logs.length,
    breakfast,
    lunch,
    dinner,
    consumed,
    uniqueStudentsCount: uniqueStudents.size,
  };
}
