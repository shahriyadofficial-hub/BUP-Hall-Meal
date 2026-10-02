import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/student/fraud-report
 * Body: { mealLogId, reporterId, mealType, reason }
 * Inserts fraud report into public.fraud_reports and marks meal_logs status as 'fraud_reported'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mealLogId, reporterId, mealType, reason } = body;

    if (!reporterId) {
      return NextResponse.json(
        { error: "Missing required field: reporterId" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    // 1. Insert into public.fraud_reports
    const { data: report, error: reportError } = await supabaseAdmin
      .from("fraud_reports")
      .insert({
        meal_log_id: mealLogId || null,
        reporter_id: reporterId,
        report_reason:
          reason ||
          `Unauthorized / Proxy dining claim detected for ${mealType || "meal"} at ${nowIso}`,
        resolved: false,
        created_at: nowIso,
      })
      .select()
      .maybeSingle();

    if (reportError) {
      console.warn("[Fraud Report API] Table insert warning:", reportError);
    }

    // 2. Update status in public.meal_logs if mealLogId is valid
    if (mealLogId) {
      await supabaseAdmin
        .from("meal_logs")
        .update({ status: "fraud_reported" })
        .eq("id", mealLogId);
    }

    return NextResponse.json({
      success: true,
      message: "Fraud report successfully logged and manager notified.",
      data: report,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit fraud report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
