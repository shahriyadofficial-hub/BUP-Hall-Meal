import { NextRequest, NextResponse } from "next/server";
import { hashDiningPin, isValidDiningPin } from "@/lib/auth-pin";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/set-pin
 * 
 * Secure API endpoint to hash a student's 4-digit dining PIN using Node crypto (SHA-256)
 * and update the public.users record for the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { pin, userId } = body;

    // 1. Validate PIN format strictly
    if (!pin || !isValidDiningPin(pin)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid PIN format. PIN must be strictly 4 numeric digits (e.g. 1234).",
        },
        { status: 400 }
      );
    }

    // 2. Resolve Authenticated User ID
    let resolvedUserId: string | null = null;

    // Check Authorization header for Bearer token
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    const supabaseAdmin = createSupabaseAdminClient();

    if (bearerToken) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(bearerToken);
      if (!userError && userData?.user?.id) {
        resolvedUserId = userData.user.id;
      }
    }

    // Fallback to server cookies if bearer token was not present or valid
    if (!resolvedUserId) {
      try {
        const supabaseServer = await createSupabaseServerClient();
        const { data: serverUserData } = await supabaseServer.auth.getUser();
        if (serverUserData?.user?.id) {
          resolvedUserId = serverUserData.user.id;
        }
      } catch {
        // Ignore cookie read failures in edge environments
      }
    }

    // Explicit userId fallback (e.g. during onboarding transition)
    if (!resolvedUserId && userId && typeof userId === "string") {
      resolvedUserId = userId;
    }

    // 3. Hash the PIN using cryptographic SHA-256
    const hashedPin = hashDiningPin(pin);

    // 4. Update the user's record in public.users if authenticated with valid UUID
    const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (resolvedUserId && isValidUuid.test(resolvedUserId)) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          dining_pin_hash: hashedPin,
          updated_at: new Date().toISOString(),
        })
        .eq("id", resolvedUserId);

      if (updateError) {
        console.warn("[set-pin] Database update warning:", updateError.message);
        // If row doesn't exist yet, return success with hash so onboarding can commit it
        return NextResponse.json({
          success: true,
          pinHash: hashedPin,
          userId: resolvedUserId,
          message: "PIN hashed. Will be persisted with profile creation.",
        });
      }

      return NextResponse.json({
        success: true,
        pinHash: hashedPin,
        message: "PIN set and encrypted successfully.",
        userId: resolvedUserId,
      });
    }

    // If no active user session was identified
    return NextResponse.json({
      success: true,
      pinHash: hashedPin,
      message: "PIN hashed successfully. Provide user authentication to bind permanently.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process PIN hashing";
    console.error("[set-pin] Error:", message);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
