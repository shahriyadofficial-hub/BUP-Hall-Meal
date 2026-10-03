import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatHallSerial } from "@/lib/hall-serial";

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Transform and normalize user records
    const formatted = (users || []).map((u) => {
      const isEdu =
        u.email?.toLowerCase().endsWith("@student.bup.edu.bd") ||
        u.email?.toLowerCase().endsWith("@bup.edu.bd") ||
        u.login_type === "bup_edu";

      return {
        id: u.id,
        student_id: u.student_id || "N/A",
        full_name: u.full_name || "Unknown Student",
        email: u.email || "",
        department: u.department || "General",
        hall: u.hall || "male",
        room_number: u.room_number || "N/A",
        avatar_url: u.avatar_url || u.profile_photo_url || null,
        profile_photo_url: u.profile_photo_url || u.avatar_url || null,
        hall_serial: formatHallSerial(u.hall_serial, u.student_id),
        raw_serial: u.hall_serial || null,
        role: u.role || "student",
        auth_provider: u.auth_provider || "google",
        login_type: isEdu ? "bup_edu" : "personal_gmail",
        is_approved: u.is_approved !== false, // true by default
        is_onboarded: u.is_onboarded !== false,
        created_at: u.created_at || new Date().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      users: formatted,
      stats: {
        total: formatted.length,
        bupEdu: formatted.filter((u) => u.login_type === "bup_edu").length,
        gmail: formatted.filter((u) => u.login_type === "personal_gmail").length,
        blocked: formatted.filter((u) => !u.is_approved).length,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch users";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, is_approved, role } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: userId" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof is_approved === "boolean") {
      updates.is_approved = is_approved;
    }

    if (role && ["student", "staff", "admin"].includes(role)) {
      updates.role = role;
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update (is_approved or role required)" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();

    const { data: updated, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: updated,
      message: `User updated successfully`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update user";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
