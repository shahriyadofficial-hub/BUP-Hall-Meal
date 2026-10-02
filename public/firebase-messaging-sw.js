/**
 * BUP Hall Dining System - Firebase Cloud Messaging Service Worker
 *
 * 1. Offline Asset Caching (cache-first for shell assets)
 * 2. Firebase Cloud Messaging background push notifications
 */

// ─── 1. PWA Offline Cache ──────────────────────────────────────────────────

const CACHE_NAME = "bup-dining-v1";
const PRECACHE_ASSETS = [
  "/",
  "/student/dashboard",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/apple-touch-icon.png",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, and Next.js API/RSC requests
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return;
  }

  // Cache-first strategy for precached shell assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || new Response("Offline", { status: 503 }));
    })
  );
});

// ─── 2. Firebase Cloud Messaging ──────────────────────────────────────────

// Import Firebase compat libraries inside service worker
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

// 3. Initialize Firebase inside Service Worker with public project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDummyKeyForSwInitBUP2026",
  authDomain: "bup-hall-meal.firebaseapp.com",
  projectId: "bup-hall-meal",
  storageBucket: "bup-hall-meal.appspot.com",
  messagingSenderId: "36729011283",
  appId: "1:36729011283:web:bupdininghall2026app",
};

firebase.initializeApp(firebaseConfig);

// 3. Retrieve Firebase Messaging instance
let messaging;
try {
  messaging = firebase.messaging();
} catch (err) {
  console.warn("[SW] Firebase messaging init in service worker:", err);
}

/**
 * Helper to get Bengali shift name
 */
function getBengaliShiftName(mealType) {
  switch (mealType) {
    case "breakfast":
      return "সকালের";
    case "dinner":
      return "রাতের";
    case "lunch":
    default:
      return "দুপুরের";
  }
}

/**
 * Handle background FCM push messages
 */
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Received background push message:", payload);

    const data = payload.data || {};
    const mealType = data.mealType || data.meal_type || "lunch";
    const bnShift = getBengaliShiftName(mealType);

    const notificationTitle =
      payload.notification?.title ||
      data.title ||
      "মিল নিশ্চিতকরণ / Meal Confirmation";

    const defaultBody = `আপনার ${bnShift} মিল সফলভাবে সংগ্রহ করা হয়েছে। অপরিচিত হলে রিপোর্ট করুন। / Your ${mealType} meal has been collected. Report if not you.`;
    const notificationBody = payload.notification?.body || data.body || defaultBody;

    const notificationOptions = {
      body: notificationBody,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: "bup-meal-claim",
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: {
        url: data.url || "/student/dashboard",
        mealType: mealType,
        timestamp: Date.now(),
      },
      actions: [
        {
          action: "open",
          title: "ড্যাশবোর্ড / View Dashboard",
        },
        {
          action: "report",
          title: "রিপোর্ট করুন / Report Fraud",
        },
      ],
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// 4. Standard Push Notification Listener Fallback
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const rawData = event.data.json();
    const data = rawData.data || rawData;
    const mealType = data.mealType || data.meal_type || "lunch";
    const bnShift = getBengaliShiftName(mealType);

    const title = rawData.notification?.title || data.title || "মিল নিশ্চিতকরণ / Meal Confirmation";
    const body =
      rawData.notification?.body ||
      data.body ||
      `আপনার ${bnShift} মিল সফলভাবে সংগ্রহ করা হয়েছে। অপরিচিত হলে রিপোর্ট করুন।`;

    const options = {
      body: body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: "bup-meal-claim",
      renotify: true,
      vibrate: [200, 100, 200],
      data: {
        url: "/student/dashboard",
        mealType: mealType,
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    // If payload is plain text
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("মিল নিশ্চিতকরণ / Meal Confirmation", {
        body: text || "আপনার মিল সফলভাবে সংগ্রহ করা হয়েছে।",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
      })
    );
  }
});

// 5. Notification Click Handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/student/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window open
      for (const client of windowClients) {
        if (client.url.includes("/student/dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      // If not open, open a new browser window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
