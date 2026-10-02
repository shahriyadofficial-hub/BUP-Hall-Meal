"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Download, Share } from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";

const DISMISS_KEY = "bup_pwa_prompt_dismissed_until";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "android" | "ios" | null;

function detectPlatform(): Platform {
  if (typeof window === "undefined") return null;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isStandalone =
    "standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone;
  if (isIOS && !isStandalone) return "ios";
  return null; // android is detected via beforeinstallprompt event
}

export function PWAInstallPrompt() {
  const { isBengali } = useTranslation();
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if previously dismissed within 7 days
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (until && Date.now() < parseInt(until, 10)) return;
    } catch {
      // ignore
    }

    const ios = detectPlatform();
    if (ios === "ios") {
      setPlatform("ios");
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("android");
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {
      // ignore
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setVisible(false);
    }
  }, [deferredPrompt]);

  if (!visible || !platform) return null;

  return (
    <div
      role="dialog"
      aria-label={isBengali ? "অ্যাপ ইনস্টল প্রম্পট" : "App install prompt"}
      className="fixed bottom-0 left-0 right-0 z-50 p-3 pb-safe"
    >
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-obsidian-900/90 shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-192x192.png"
              alt="BUP Dining"
              className="h-10 w-10 rounded-xl"
            />
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {isBengali ? "বিইউপি ডাইনিং" : "BUP Dining"}
              </p>
              <p className="text-xs text-slate-400">bup-dining.app</p>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-full p-1 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-4">
          {platform === "android" && (
            <>
              <p className="mb-3 text-sm text-slate-300">
                {isBengali
                  ? "হোম স্ক্রিনে বিইউপি ডাইনিং অ্যাপ যোগ করুন — দ্রুত মিল বুকিং ও QR পাস সরাসরি ব্যবহার করুন।"
                  : "Install BUP Dining to your home screen for instant meal booking and QR pass access."}
              </p>
              <button
                onClick={handleInstall}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-95"
              >
                <Download size={16} />
                {isBengali ? "ইনস্টল করুন / Install" : "Install App"}
              </button>
            </>
          )}

          {platform === "ios" && (
            <>
              <p className="mb-2 text-sm text-slate-300">
                {isBengali
                  ? "অ্যাপ হিসেবে ব্যবহার করতে নিচের ধাপ অনুসরণ করুন:"
                  : "To install the app on iOS:"}
              </p>
              <ol className="space-y-1.5 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Share size={14} className="shrink-0 text-emerald-400" />
                  {isBengali
                    ? "নিচের মেনু বারে Share বাটনে ট্যাপ করুন"
                    : "Tap the Share button in the bottom bar"}
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-slate-700 text-[10px] font-bold text-slate-300">
                    +
                  </span>
                  {isBengali
                    ? "'Add to Home Screen' বেছে নিন"
                    : "Select 'Add to Home Screen'"}
                </li>
              </ol>
            </>
          )}
        </div>

        {/* Bottom accent */}
        <div className="h-1 w-full rounded-b-2xl bg-gradient-to-r from-emerald-600/60 via-emerald-500/80 to-emerald-600/60" />
      </div>
    </div>
  );
}
