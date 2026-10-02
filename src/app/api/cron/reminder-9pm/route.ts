import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { firebaseAdmin } from "@/lib/firebaseAdmin";

/**
 * Returns current Bangladesh Standard Time (BST, UTC+6) date details
 */
function getBST() {
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
  const parts = formatter.formatToParts(new Date());
  const find = (type: string) => parts.find((p) => p.type === type)?.value || "00";

  return {
    year: parseInt(find("year"), 10),
    month: parseInt(find("month"), 10),
    day: parseInt(find("day"), 10),
    hour: parseInt(find("hour"), 10),
    minute: parseInt(find("minute"), 10),
    second: parseInt(find("second"), 10),
  };
}

/**
 * GET & POST /api/cron/reminder-9pm
 * 
 * Scheduled daily at 21:00 BST (15:00 UTC via Vercel Cron).
 * Finds all active students who have zero active meals booked for tomorrow
 * and sends an urgent multicast reminder push alert.
 */
export async function GET(request: NextRequest) {
  return handleCronJob(request);
}

export async function POST(request: NextRequest) {
  return handleCronJob(request);
}

async function handleCronJob(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ------------------------------------------------------------------------
    // 1. Authorization Check: Bearer ${CRON_SECRET}
    // ------------------------------------------------------------------------
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: Invalid or missing CRON_SECRET authorization header.",
        },
        { status: 401 }
      );
    }

    // ------------------------------------------------------------------------
    // 2. Timezone-Safe Calculation: Tomorrow's Date in Asia/Dhaka
    // ------------------------------------------------------------------------
    const bst = getBST();
    const tomorrowUtcDate = new Date(Date.UTC(bst.year, bst.month - 1, bst.day + 1));
    const tomorrowStr = `${tomorrowUtcDate.getUTCFullYear()}-${String(
      tomorrowUtcDate.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(tomorrowUtcDate.getUTCDate()).padStart(2, "0")}`;

    const supabaseAdmin = createSupabaseAdminClient();

    // ------------------------------------------------------------------------
    // 3. Data Filtering via Supabase Admin Client
    // ------------------------------------------------------------------------
    // Fetch all approved students with active FCM push tokens
    const { data: approvedStudents, error: studentsError } = await supabaseAdmin
      .from("users")
      .select("id, student_id, full_name, fcm_token")
      .eq("role", "student")
      .eq("is_approved", true)
      .not("fcm_token", "is", null);

    if (studentsError) {
      throw new Error(`Failed to query approved students: ${studentsError.message}`);
    }

    const totalStudentsWithTokens = approvedStudents?.length || 0;

    // Fetch tomorrow's bookings where at least ONE meal is active
    const { data: tomorrowActiveBookings, error: bookingsError } = await supabaseAdmin
      .from("meal_bookings")
      .select("user_id, breakfast, lunch, dinner")
      .eq("booking_date", tomorrowStr)
      .or("breakfast.eq.true,lunch.eq.true,dinner.eq.true");

    if (bookingsError) {
      throw new Error(`Failed to query active bookings: ${bookingsError.message}`);
    }

    // Build Set of User IDs that have already booked at least 1 meal
    const bookedUserIds = new Set(
      (tomorrowActiveBookings || []).map((booking) => booking.user_id)
    );

    // Filter down to only students with zero active meals booked for tomorrow
    const unbookedTargetStudents = (approvedStudents || []).filter(
      (student) => !bookedUserIds.has(student.id) && student.fcm_token
    );

    const targetTokens = unbookedTargetStudents
      .map((student) => student.fcm_token as string)
      .filter(Boolean);

    // ------------------------------------------------------------------------
    // 4. Multicast Push Dispatch in Batches of 500
    // ------------------------------------------------------------------------
    let totalSuccessCount = 0;
    let totalFailureCount = 0;
    const deadTokensToClean: string[] = [];
    const BATCH_SIZE = 500;
    const batchesCount = Math.ceil(targetTokens.length / BATCH_SIZE);

    if (targetTokens.length > 0) {
      const messaging = firebaseAdmin.messaging();

      for (let i = 0; i < targetTokens.length; i += BATCH_SIZE) {
        const batchTokens = targetTokens.slice(i, i + BATCH_SIZE);

        const multicastMessage = {
          tokens: batchTokens,
          notification: {
            title:
              "⚠️ আগামীকালের মিল বন্ধ হতে ১ ঘণ্টা বাকি! / ⚠️ 1 hour left to book tomorrow's meal!",
            body: "রাত ১০টায় মিল উইন্ডো বন্ধ হয়ে যাবে। খাবার খেতে চাইলে এখনই মিল অন করুন।",
          },
          data: {
            url: "/student/dashboard",
            click_action: "/student/dashboard",
            type: "9pm_booking_reminder",
            bookingDate: tomorrowStr,
            cutoffTime: "22:00 BST",
          },
          webpush: {
            notification: {
              title:
                "⚠️ আগামীকালের মিল বন্ধ হতে ১ ঘণ্টা বাকি! / ⚠️ 1 hour left to book tomorrow's meal!",
              body: "রাত ১০টায় মিল উইন্ডো বন্ধ হয়ে যাবে। খাবার খেতে চাইলে এখনই মিল অন করুন।",
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-192x192.png",
              tag: "bup-meal-reminder-9pm",
              renotify: true,
              requireInteraction: true,
            },
            fcmOptions: {
              link: "/student/dashboard",
            },
          },
        };

        const multicastResponse = await messaging.sendEachForMulticast(multicastMessage);

        totalSuccessCount += multicastResponse.successCount;
        totalFailureCount += multicastResponse.failureCount;

        // --------------------------------------------------------------------
        // 5. Dead Token Cleanup
        // --------------------------------------------------------------------
        multicastResponse.responses.forEach((res, index) => {
          if (!res.success && res.error) {
            const errCode = res.error.code;
            if (
              errCode === "messaging/registration-token-not-registered" ||
              errCode === "messaging/invalid-registration-token" ||
              errCode === "messaging/invalid-argument"
            ) {
              deadTokensToClean.push(batchTokens[index]);
            }
          }
        });
      }

      // Purge dead / expired FCM tokens from Supabase users table
      if (deadTokensToClean.length > 0) {
        await supabaseAdmin
          .from("users")
          .update({ fcm_token: null })
          .in("fcm_token", deadTokensToClean);

        console.log(
          `[9PM Cron Reminder] Cleaned ${deadTokensToClean.length} expired FCM tokens from database.`
        );
      }
    }

    const executionLatencyMs = Date.now() - startTime;

    // ------------------------------------------------------------------------
    // 6. Return Structured Execution Statistics
    // ------------------------------------------------------------------------
    return NextResponse.json({
      success: true,
      job: "Daily 9:00 PM BST Meal Booking Reminder",
      scheduleUtc: "15:00 UTC",
      bstTriggerTime: `${String(bst.hour).padStart(2, "0")}:${String(bst.minute).padStart(2, "0")} BST`,
      tomorrowDate: tomorrowStr,
      executionLatencyMs,
      metrics: {
        totalApprovedStudentsWithToken: totalStudentsWithTokens,
        bookedStudentsCount: bookedUserIds.size,
        unbookedStudentsTargeted: unbookedTargetStudents.length,
        batchesProcessed: batchesCount,
        multicastResults: {
          successCount: totalSuccessCount,
          failureCount: totalFailureCount,
        },
        deadTokensPurged: deadTokensToClean.length,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[9PM Cron Reminder Error]", errorMsg);

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        executionLatencyMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
