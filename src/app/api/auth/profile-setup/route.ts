import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hashDiningPin, isValidDiningPin, normalizePhoneNumber } from "@/lib/auth-pin";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { HallType } from "@/types";
import { normalizeHallSerial } from "@/lib/hall-serial";

/**
 * POST /api/auth/profile-setup
 * 
 * Stores or completes the student's institutional hall profile.
 * Default is_approved = true for all completed profiles as requested.
 * Classifies login_type as 'bup_edu' or 'personal_gmail' for admin audit logging.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      userId,
      studentId,
      fullName,
      email,
      avatarUrl,
      hallSerial,
      hall = "male",
      roomNumber,
      department,
      session = "2024-2025",
      phoneNumber,
      pin = "1234",
      authProvider = "google",
    } = body;

    // 1. Mandatory Validations
    if (!studentId || typeof studentId !== "string" || !studentId.trim()) {
      return NextResponse.json({ success: false, error: "Student ID is required." }, { status: 400 });
    }

    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return NextResponse.json({ success: false, error: "Full Name is required." }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }

    if (!roomNumber || typeof roomNumber !== "string" || !roomNumber.trim()) {
      return NextResponse.json({ success: false, error: "Room Number is required." }, { status: 400 });
    }

    if (!department || typeof department !== "string" || !department.trim()) {
      return NextResponse.json({ success: false, error: "Department is required." }, { status: 400 });
    }

    // 2. Resolve User ID from Bearer token or payload
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const supabaseAdmin = createSupabaseAdminClient();

    let resolvedId = userId;
    if (bearerToken) {
      const { data: authData } = await supabaseAdmin.auth.getUser(bearerToken);
      if (authData?.user?.id) {
        resolvedId = authData.user.id;
      }
    }

    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!resolvedId || !isValidUuid.test(resolvedId)) {
      resolvedId = crypto.randomUUID();
    }

    // 3. Pin Hash & TOTP Secret
    let finalPinHash = "";
    if (isValidDiningPin(pin)) {
      finalPinHash = hashDiningPin(pin);
    } else {
      finalPinHash = hashDiningPin("1234");
    }
    const totpSecret = crypto.randomBytes(20).toString("hex");

    // 4. Hall Serial & Login Type Classification
    const cleanEmail = email.trim().toLowerCase();
    const loginType = cleanEmail.endsWith("bup.edu.bd") ? "bup_edu" : "personal_gmail";
    const formattedSerial = normalizeHallSerial(hallSerial || studentId.trim().slice(-3));
    const validHalls: HallType[] = ["male", "female"];
    const normalizedHall: HallType = validHalls.includes(hall) ? hall : "male";
    const normalizedPhone = phoneNumber ? normalizePhoneNumber(phoneNumber) : "01700000000";

    // 5. Full Extended Payload
    const extendedPayload = {
      id: resolvedId,
      student_id: studentId.trim(),
      full_name: fullName.trim(),
      email: cleanEmail,
      department: department.trim(),
      session: session.trim(),
      hall: normalizedHall,
      room_number: roomNumber.trim(),
      phone_number: normalizedPhone,
      phone_verified: true,
      role: "student",
      profile_photo_url: avatarUrl || null,
      avatar_url: avatarUrl || null,
      totp_secret: totpSecret,
      dining_pin_hash: finalPinHash,
      is_approved: true, // Default: true for all completed profiles
      is_onboarded: true,
      hall_serial: formattedSerial,
      auth_provider: authProvider || "google",
      login_type: loginType,
      updated_at: new Date().toISOString(),
    };

    // 6. Base Payload (fallback if extra columns are not in Postgres schema cache yet)
    const basePayload = {
      id: resolvedId,
      student_id: studentId.trim(),
      full_name: fullName.trim(),
      email: cleanEmail,
      department: department.trim(),
      session: session.trim(),
      hall: normalizedHall,
      room_number: roomNumber.trim(),
      phone_number: normalizedPhone,
      phone_verified: true,
      role: "student",
      profile_photo_url: avatarUrl || null,
      totp_secret: totpSecret,
      dining_pin_hash: finalPinHash,
      is_approved: true,
      is_onboarded: true,
      updated_at: new Date().toISOString(),
    };

    // Attempt upsert with extended columns
    let upsertResult = await supabaseAdmin
      .from("users")
      .upsert(extendedPayload, { onConflict: "id" })
      .select()
      .maybeSingle();

    if (upsertResult.error) {
      console.warn("[profile-setup] Extended upsert warning:", upsertResult.error.message, "- trying base payload");
      upsertResult = await supabaseAdmin
        .from("users")
        .upsert(basePayload, { onConflict: "id" })
        .select()
        .maybeSingle();
    }

    // Also persist metadata to auth.users if available
    try {
      await supabaseAdmin.auth.admin.updateUserById(resolvedId, {
        user_metadata: {
          student_id: studentId.trim(),
          hall_serial: formattedSerial,
          department: department.trim(),
          room_number: roomNumber.trim(),
          login_type: loginType,
          avatar_url: avatarUrl,
        },
      });
    } catch {
      // Ignore if user not in auth.users (e.g. offline/mock)
    }

    return NextResponse.json({
      success: true,
      user: {
        ...(upsertResult.data || basePayload),
        hall_serial: formattedSerial,
        login_type: loginType,
        auth_provider: authProvider,
        avatar_url: avatarUrl,
      },
      message: "Profile setup completed successfully with automatic approval.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Profile setup failed";
    console.error("[profile-setup] Error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
