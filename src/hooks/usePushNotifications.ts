"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage, MessagePayload } from "firebase/messaging";
import { supabase } from "@/lib/supabase/client";

// Public Firebase Web Client Configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDummyKeyForSwInitBUP2026",
  authDomain: "bup-hall-meal.firebaseapp.com",
  projectId: "bup-hall-meal",
  storageBucket: "bup-hall-meal.appspot.com",
  messagingSenderId: "36729011283",
  appId: "1:36729011283:web:bupdininghall2026app",
};

const VAPID_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BFQ3qt2WL5eEtakCBb2rtVmYBuIxo7W2h3V57Dn3NRMaAGfxVJxTQ-z3j0_F5MWAAkct35KtyysLhnArQZk6F0Q";

export interface PushNotificationHookResult {
  fcmToken: string | null;
  permission: NotificationPermission;
  isSupported: boolean;
  isLoading: boolean;
  requestPermission: () => Promise<string | null>;
  foregroundMessage: MessagePayload | null;
}

/**
 * Custom React Hook: usePushNotifications
 * 
 * Requests browser notification permissions on student dashboard mount,
 * registers the Firebase messaging service worker, retrieves the FCM VAPID token,
 * and synchronizes the token into public.users.fcm_token in Supabase.
 */
export function usePushNotifications(userId?: string | null): PushNotificationHookResult {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [foregroundMessage, setForegroundMessage] = useState<MessagePayload | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 1. Check browser feature support
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator
    ) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  /**
   * Save FCM token to database
   */
  const saveTokenToDatabase = useCallback(
    async (token: string, targetUserId: string) => {
      try {
        // Attempt 1: Direct Supabase client update
        await supabase
          .from("users")
          .update({ fcm_token: token, updated_at: new Date().toISOString() })
          .eq("id", targetUserId);

        // Attempt 2: Server-side API endpoint for guaranteed RLS bypass
        await fetch("/api/student/fcm-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: targetUserId, fcmToken: token }),
        });

        console.log("[PushNotifications] FCM token persisted for user:", targetUserId);
      } catch (err) {
        console.warn("[PushNotifications] Could not persist FCM token:", err);
      }
    },
    []
  );

  /**
   * Request permission and obtain token
   */
  const requestPermission = useCallback(async (): Promise<string | null> => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      return null;
    }

    setIsLoading(true);
    try {
      // 1. Request notification permission
      const currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);

      if (currentPermission !== "granted") {
        setIsLoading(false);
        return null;
      }

      // 2. Initialize Firebase client app
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      const messaging = getMessaging(app);

      // 3. Register or reuse service worker
      let swReg = registrationRef.current;
      if (!swReg) {
        swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
          scope: "/",
        });
        registrationRef.current = swReg;
      }

      await navigator.serviceWorker.ready;

      // 4. Retrieve FCM token
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swReg,
      });

      if (token) {
        setFcmToken(token);
        if (userId) {
          await saveTokenToDatabase(token, userId);
        }
      }

      // 5. Setup foreground message listener with cleanup
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      unsubscribeRef.current = onMessage(messaging, (payload) => {
        console.log("[PushNotifications] Foreground message received:", payload);
        setForegroundMessage(payload);

        // Trigger native notification if permission granted
        if (Notification.permission === "granted") {
          try {
            new Notification(
              payload.notification?.title || "মিল নিশ্চিতকরণ / Meal Confirmation",
              {
                body:
                  payload.notification?.body ||
                  "আপনার মিল সফলভাবে সংগ্রহ করা হয়েছে। অপরিচিত হলে রিপোর্ট করুন।",
                icon: "/icons/icon-192x192.png",
                badge: "/icons/icon-192x192.png",
              }
            );
          } catch (e) {
            // Mobile browser may disallow direct new Notification
          }
        }
      });

      setIsLoading(false);
      return token;
    } catch (err) {
      console.warn("[PushNotifications] Permission/Token error:", err);
      setIsLoading(false);
      return null;
    }
  }, [userId, saveTokenToDatabase]);

  // Automatically request on mount if user is logged in
  useEffect(() => {
    if (userId && isSupported) {
      requestPermission();
    }
  }, [userId, isSupported, requestPermission]);

  return {
    fcmToken,
    permission,
    isSupported,
    isLoading,
    requestPermission,
    foregroundMessage,
  };
}
