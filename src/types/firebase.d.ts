declare module "firebase/app" {
  export interface FirebaseApp {
    name: string;
    options: Record<string, unknown>;
  }
  export function initializeApp(options: Record<string, unknown>, name?: string): FirebaseApp;
  export function getApps(): FirebaseApp[];
  export function getApp(name?: string): FirebaseApp;
}

declare module "firebase/messaging" {
  export interface Messaging {}
  export interface MessagePayload {
    notification?: {
      title?: string;
      body?: string;
      image?: string;
    };
    data?: Record<string, string>;
  }
  export function getMessaging(app?: unknown): Messaging;
  export function getToken(messaging: Messaging, options?: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration }): Promise<string>;
  export function onMessage(messaging: Messaging, nextOrObserver: (payload: MessagePayload) => void): () => void;
}
