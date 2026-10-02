import { initializeApp, getApps, getApp, cert, App } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";

/**
 * Singleton Firebase Admin Initializer
 * Initializes firebase-admin/app and firebase-admin/messaging using institutional service account credentials.
 */
function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "[FirebaseAdmin] Missing Firebase Admin credentials in environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)."
    );
  }

  // Sanitize escaped newlines in private key
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

/**
 * Access the singleton Firebase Admin App instance
 */
export function getFirebaseAdminApp(): App {
  return initializeFirebaseAdmin();
}

/**
 * Access the singleton Firebase Messaging instance for push notifications
 */
export function getFirebaseMessaging(): Messaging {
  const app = getFirebaseAdminApp();
  return getMessaging(app);
}

/**
 * Default export wrapper
 */
export const firebaseAdmin = {
  get app() {
    return getFirebaseAdminApp();
  },
  messaging() {
    return getFirebaseMessaging();
  },
};

export default firebaseAdmin;
