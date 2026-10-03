"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { hashDiningPin, isValidDiningPin, normalizePhoneNumber } from "@/lib/auth-pin";
import { normalizeHallSerial } from "@/lib/hall-serial";

export interface ProfileSetupPayload {
  userId?: string;
  fullName: string;
  studentId: string;
  department: string;
  roomNumber: string;
  hallSerial?: string;
  hall?: "male" | "female";
  academicSession?: string;
  phoneNumber?: string;
  pin?: string;
  email?: string;
  avatarUrl?: string | null;
}

export async function submitProfileSetupAction(data: ProfileSetupPayload) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const targetUserId = user?.id || data.userId;

    if (!targetUserId) {
      return { success: false, error: "Authentication session expired. Please log in again." };
    }

    if (!data.studentId?.trim() || !data.fullName?.trim() || !data.roomNumber?.trim() || !data.department?.trim()) {
      return { success: false, error: "Please fill in all required fields." };
    }

    const cleanEmail = (data.email || user?.email || "").trim().toLowerCase();
    const cleanStudentId = data.studentId.trim();
    const rawSerial = data.hallSerial || cleanStudentId.slice(-3);
    const parsedSerial = parseInt(rawSerial.replace(/\D/g, "") || "1", 10);
    const formattedSerialStr = normalizeHallSerial(rawSerial);

    let pinHash = "";
    if (data.pin && isValidDiningPin(data.pin)) {
      pinHash = hashDiningPin(data.pin);
    } else {
      pinHash = hashDiningPin("1234");
    }

    const supabaseAdmin = createSupabaseAdminClient();

    // Upsert user profile to guarantee row exists and is marked onboarded
    const { error } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: targetUserId,
          student_id: cleanStudentId,
          full_name: data.fullName.trim(),
          email: cleanEmail || `${cleanStudentId}@student.bup.edu.bd`,
          department: data.department.trim(),
          room_number: data.roomNumber.trim(),
          hall_serial: parsedSerial,
          hall: data.hall || "male",
          session: data.academicSession || "2024-2025",
          phone_number: data.phoneNumber ? normalizePhoneNumber(data.phoneNumber) : "01700000000",
          phone_verified: true,
          role: "student",
          profile_photo_url: data.avatarUrl || null,
          avatar_url: data.avatarUrl || null,
          dining_pin_hash: pinHash,
          is_approved: true,
          is_onboarded: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error("[submitProfileSetupAction] Error:", error.message);
      return { success: false, error: error.message };
    }

    // Force revalidate root layout and cache
    revalidatePath("/", "layout");
    revalidatePath("/student/dashboard", "page");

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update profile";
    console.error("[submitProfileSetupAction] Exception:", msg);
    return { success: false, error: msg };
  }
}
