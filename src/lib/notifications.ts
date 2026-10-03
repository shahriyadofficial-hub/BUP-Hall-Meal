import { getFirebaseMessaging } from "@/lib/firebaseAdmin";
import { Message } from "firebase-admin/messaging";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { MealType } from "@/types";

/**
 * Returns Bengali & English shift terminology
 */
function getShiftLabel(mealType: MealType): { bn: string; en: string } {
  switch (mealType) {
    case "breakfast":
      return { bn: "সকালের", en: "breakfast" };
    case "dinner":
      return { bn: "রাতের", en: "dinner" };
    case "lunch":
    default:
      return { bn: "দুপুরের", en: "lunch" };
  }
}

/**
 * Dispatches an instant high-priority Web Push Notification to a student
 * immediately after their meal has been verified and logged at the counter.
 *
 * @param userId UUID of the student
 * @param mealType 'breakfast' | 'lunch' | 'dinner'
 */
export async function sendMealPushAlert(
  userId: string,
  mealType: MealType
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();

    // 1. Fetch user's registered FCM token
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, student_id, full_name, fcm_token")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      console.warn(`[Notifications] User ${userId} not found for meal push alert.`);
      return { success: false, error: "user_not_found" };
    }

    if (!user.fcm_token) {
      console.log(`[Notifications] User ${user.student_id} has no FCM token registered.`);
      return { success: false, error: "no_fcm_token" };
    }

    // 2. Get Firebase Messaging via the shared singleton (no duplicate initializeApp)
    let messaging;
    try {
      messaging = getFirebaseMessaging();
    } catch {
      return { success: false, error: "firebase_admin_uninitialized" };
    }

    const shift = getShiftLabel(mealType);

    const title = "মিল নিশ্চিতকরণ / Meal Confirmation";
    const body = `আপনার ${shift.bn} মিল সফলভাবে সংগ্রহ করা হয়েছে। অপরিচিত হলে রিপোর্ট করুন। / Your ${shift.en} meal has been collected. Report if not you.`;

    // 3. Construct Message Payload
    const message: Message = {
      token: user.fcm_token,
      notification: {
        title,
        body,
      },
      data: {
        mealType: String(mealType),
        userId: String(userId),
        studentId: String(user.student_id),
        claimedAt: new Date().toISOString(),
        url: "/student/dashboard",
      },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          tag: "bup-meal-claim",
          renotify: true,
          requireInteraction: true,
        },
        fcmOptions: {
          link: "/student/dashboard",
        },
      },
    };

    // 4. Send Message via FCM
    const messageId = await messaging.send(message);
    console.log(`[Notifications] FCM Push dispatched to ${user.student_id}:`, messageId);

    return { success: true, messageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Notifications] Failed to send meal push alert:", errorMsg);

    // If token is unregistered, clear from database
    if (errorMsg.includes("registration-token-not-registered")) {
      try {
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin
          .from("users")
          .update({ fcm_token: null })
          .eq("id", userId);
        console.log(`[Notifications] Cleaned up obsolete FCM token for user ${userId}`);
      } catch {
        // ignore cleanup error
      }
    }

    return { success: false, error: errorMsg };
  }
}
