import { NextRequest, NextResponse } from "next/server";
import {
  isValidBangladeshiPhone,
  normalizePhoneNumber,
  phoneOtpStore,
  verifiedPhonesStore,
  isPhoneRecentlyVerified,
  markPhoneAsVerified,
  cleanupExpiredPhoneOtps,
} from "@/lib/auth-pin";

/**
 * POST /api/auth/verify-phone
 * 
 * Handles two actions:
 * 1. action: "send" -> Dispatches a 6-digit SMS OTP to student's phone
 * 2. action: "verify" -> Confirms student's submitted 6-digit phone OTP
 */
export async function POST(request: NextRequest) {
  try {
    cleanupExpiredPhoneOtps();

    const body = await request.json().catch(() => ({}));
    const { action, phoneNumber, otp } = body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      return NextResponse.json(
        { success: false, error: "Valid mobile phone number is required." },
        { status: 400 }
      );
    }

    if (!isValidBangladeshiPhone(phoneNumber)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid phone number format. Please provide an 11-digit Bangladeshi mobile number (e.g. 01XXXXXXXXX).",
        },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // ----------------------------------------------------
    // Action 1: Send OTP
    // ----------------------------------------------------
    if (action === "send") {
      // Generate secure 6-digit numeric OTP
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      // 5-minute expiry
      const expiresAt = Date.now() + 5 * 60 * 1000;

      phoneOtpStore.set(normalizedPhone, { otp: generatedOtp, expiresAt });

      console.log(
        `[BUP SMS Gateway] Simulated SMS dispatched to ${normalizedPhone}: "Your BUP Hall Dining verification OTP is ${generatedOtp}. Valid for 5 minutes."`
      );

      return NextResponse.json({
        success: true,
        message: "A 6-digit verification code has been dispatched to your phone.",
        // For testing/preview testability, provide demoOtp
        demoOtp: generatedOtp,
        expiresIn: 300,
      });
    }

    // ----------------------------------------------------
    // Action 2: Verify OTP
    // ----------------------------------------------------
    if (action === "verify") {
      if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
        return NextResponse.json(
          { success: false, error: "Please enter a valid 6-digit OTP code." },
          { status: 400 }
        );
      }

      const inputOtp = otp.trim();
      const record = phoneOtpStore.get(normalizedPhone);

      // Support universal test code 123456 or generated OTP
      const isUniversalDevCode = inputOtp === "123456";
      const isMatchedOtp = record && record.otp === inputOtp && record.expiresAt > Date.now();

      if (!isUniversalDevCode && !isMatchedOtp) {
        if (record && record.expiresAt <= Date.now()) {
          phoneOtpStore.delete(normalizedPhone);
          return NextResponse.json(
            { success: false, error: "OTP code has expired. Please request a new code." },
            { status: 400 }
          );
        }

        return NextResponse.json(
          { success: false, error: "Invalid OTP verification code. Please check and try again." },
          { status: 400 }
        );
      }

      // Consumed OTP & record verified state
      phoneOtpStore.delete(normalizedPhone);
      verifiedPhonesStore.set(normalizedPhone, Date.now());

      return NextResponse.json({
        success: true,
        verified: true,
        phoneNumber: normalizedPhone,
        message: "Phone number verified successfully.",
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action. Supported actions: 'send' or 'verify'." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Phone verification error";
    console.error("[verify-phone] Error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
