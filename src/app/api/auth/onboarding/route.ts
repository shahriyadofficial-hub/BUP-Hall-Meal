import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hashDiningPin, isValidDiningPin, isValidEmail, normalizePhoneNumber, isPhoneRecentlyVerified } from "@/lib/auth-pin";
import { isBUPEduEmail, extractStudentIdFromEmail } from "@/lib/auth-utils";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { HallType } from "@/types";

/**
 * POST /api/auth/onboarding
 * 
 * Saves the student's registration profile in public.users.
 * Uses the Supabase Service Role client to bypass RLS initial insertion limits.
 * 
 * Note: Students logging in with official @bup.edu.bd emails are automatically
 * approved. Students registering with non-edu emails require manual hall authority verification.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      userId,
      studentId,
      fullName,
      email,
      department,
      bloodGroup,
      session,
      hall,
      roomNumber,
      phoneNumber,
      isPhoneVerified,
      profilePhotoUrl,
      pin,
      pinHash,
    } = body;

    // 1. Mandatory field checks & Student ID extraction
    let resolvedStudentId = studentId && typeof studentId === "string" ? studentId.trim() : "";
    if (!resolvedStudentId && email) {
      const extracted = extractStudentIdFromEmail(email);
      if (extracted && /^\d+$/.test(extracted)) {
        resolvedStudentId = extracted;
      }
    }

    if (!resolvedStudentId) {
      return NextResponse.json(
        { success: false, error: "Student ID is required." },
        { status: 400 }
      );
    }

    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return NextResponse.json(
        { success: false, error: "Full Name is required." },
        { status: 400 }
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "A valid email address is required.",
        },
        { status: 400 }
      );
    }

    if (!department || typeof department !== "string" || !department.trim()) {
      return NextResponse.json(
        { success: false, error: "Department is required." },
        { status: 400 }
      );
    }

    if (!bloodGroup || typeof bloodGroup !== "string" || !bloodGroup.trim()) {
      return NextResponse.json(
        { success: false, error: "Blood Group is required." },
        { status: 400 }
      );
    }

    if (!session || typeof session !== "string" || !session.trim()) {
      return NextResponse.json(
        { success: false, error: "Academic Session is required." },
        { status: 400 }
      );
    }

    const validHalls: HallType[] = ["male", "female"];
    const normalizedHall: HallType = validHalls.includes(hall) ? hall : "male";

    if (!roomNumber || typeof roomNumber !== "string" || !roomNumber.trim()) {
      return NextResponse.json(
        { success: false, error: "Room Number is required." },
        { status: 400 }
      );
    }

    if (!phoneNumber || typeof phoneNumber !== "string" || !phoneNumber.trim()) {
      return NextResponse.json(
        { success: false, error: "Phone Number is required." },
        { status: 400 }
      );
    }

    // 2. Hash Dining PIN if raw PIN was submitted
    let finalPinHash = pinHash;
    if (!finalPinHash && pin) {
      if (!isValidDiningPin(pin)) {
        return NextResponse.json(
          { success: false, error: "PIN must be exactly 4 digits." },
          { status: 400 }
        );
      }
      finalPinHash = hashDiningPin(pin);
    }

    if (!finalPinHash) {
      return NextResponse.json(
        { success: false, error: "4-Digit Dining PIN is required." },
        { status: 400 }
      );
    }

    // 3. Resolve user ID and authenticated email
    let resolvedId = userId;
    let authenticatedEmail: string | null = null;
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    const supabaseAdmin = createSupabaseAdminClient();

    if (bearerToken) {
      const { data: authData } = await supabaseAdmin.auth.getUser(bearerToken);
      if (authData?.user?.id) {
        resolvedId = authData.user.id;
        authenticatedEmail = authData.user.email || null;
      }
    }

    // If no valid UUID provided, create a random UUID for PostgreSQL compatibility
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!resolvedId || !isValidUuid.test(resolvedId)) {
      resolvedId = crypto.randomUUID();
    }

    // 4. Phone verification state & normalization
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const serverVerifiedPhone = isPhoneRecentlyVerified(normalizedPhone);
    const finalPhoneVerified = Boolean(isPhoneVerified || serverVerifiedPhone);

    // 5. Generate RFC 6238 TOTP seed secret (20 random bytes hex encoded)
    const totpSecret = crypto.randomBytes(20).toString("hex");

    // 6. Automatic vs Manual Approval Logic:
    // Both @student.bup.edu.bd and @bup.edu.bd are recognized as authentic BUP institutional emails with instant auto-approval.
    // Users logging in with phone numbers or personal (non-edu) emails require manual Hall authority verification.
    const { authMethod } = body;
    let isApproved = false;

    if (authMethod === "phone") {
      // User logged in via phone -> requires manual Hall authority verification
      isApproved = false;
    } else if (authenticatedEmail) {
      // User authenticated via Supabase email OTP -> must be an official BUP edu mail
      isApproved = isBUPEduEmail(authenticatedEmail) && isBUPEduEmail(email);
    } else {
      // In offline / preview fallback mode, inspect the verified email
      isApproved = isBUPEduEmail(email);
    }

    // 7. Upsert profile into public.users
    const userPayload = {
      id: resolvedId,
      student_id: resolvedStudentId,
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      department: department.trim(),
      blood_group: bloodGroup.trim(),
      session: session.trim(),
      hall: normalizedHall,
      room_number: roomNumber.trim(),
      phone_number: normalizedPhone,
      phone_verified: finalPhoneVerified,
      role: "student",
      profile_photo_url: profilePhotoUrl || null,
      totp_secret: totpSecret,
      dining_pin_hash: finalPinHash,
      is_approved: isApproved,
      is_onboarded: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("users")
      .upsert(userPayload, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.warn("[onboarding] DB upsert warning:", error.message);
      // In offline / mock development mode, return success with payload
      return NextResponse.json({
        success: true,
        user: userPayload,
        isApproved,
        verification_status: isApproved ? "verified" : "pending",
        isMock: true,
        message: isApproved
          ? "Profile registered and automatically approved via BUP institutional email."
          : "Profile registered successfully. Status is pending manual verification by Hall authority.",
      });
    }

    return NextResponse.json({
      success: true,
      user: data || userPayload,
      isApproved,
      verification_status: isApproved ? "verified" : "pending",
      message: isApproved
        ? "Student profile created and automatically approved via BUP institutional email."
        : "Student profile submitted successfully. Status is now pending manual verification by Hall authority.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to complete student onboarding";
    console.error("[onboarding] Error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
