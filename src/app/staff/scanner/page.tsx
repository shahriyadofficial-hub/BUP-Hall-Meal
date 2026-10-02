"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { 
  Camera, 
  CameraOff, 
  RefreshCw, 
  Keyboard, 
  Utensils, 
  Sun, 
  Moon, 
  Coffee, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  ArrowLeft,
  Zap,
  Volume2,
  VolumeX,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { MealType, DynamicQRPayload, CounterVerificationResponse } from "@/types";
import { playFeedback } from "@/lib/audio-feedback";
import CounterVerificationModal, { VerificationModalData } from "@/components/CounterVerificationModal";
import DeadBatteryModal from "@/components/DeadBatteryModal";
import { cn } from "@/lib/utils";

/**
 * Calculates current active meal shift based on Bangladesh Standard Time (BST, UTC+6)
 * - 07:00 AM – 10:30 AM BST: Breakfast (সকাল)
 * - 11:30 AM – 03:30 PM BST: Lunch (দুপুর)
 * - 06:30 PM – 10:30 PM BST: Dinner (রাত)
 */
function getActiveShiftByTime(): MealType {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const timeVal = hour + minute / 60;

  if (timeVal >= 7 && timeVal < 10.5) return "breakfast";
  if (timeVal >= 11.5 && timeVal < 15.5) return "lunch";
  if (timeVal >= 18.5 && timeVal < 22.5) return "dinner";
  
  // Off-peak fallbacks:
  if (timeVal < 11.5) return "breakfast";
  if (timeVal < 18.5) return "lunch";
  return "dinner";
}

export default function StaffScannerPage() {
  // Scanner element & instance refs
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isThrottledRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Active meal shift state
  const [activeShift, setActiveShift] = useState<MealType>(getActiveShiftByTime);
  
  // Camera status
  const [scannerStatus, setScannerStatus] = useState<"initializing" | "running" | "paused" | "error">("initializing");
  const [errorMessage, setErrorMessage] = useState<{ bn: string; en: string } | null>(null);

  // Scan result feedback
  const [lastScannedPayload, setLastScannedPayload] = useState<DynamicQRPayload | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Verification Modal State (Task 8: Auto-Dismiss Feedback Modal)
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationModalData | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Dead Battery Keypad Modal State (Task 9)
  const [isKeypadModalOpen, setIsKeypadModalOpen] = useState(false);

  // Torch / Flashlight state
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Sound feedback toggle
  const [isSoundMuted, setIsSoundMuted] = useState(false);

  // Shift config labels
  const shiftLabels: Record<MealType, { bn: string; en: string; time: string; icon: React.ElementType }> = {
    breakfast: {
      bn: "সকাল",
      en: "Breakfast",
      time: "07:00 AM – 10:30 AM",
      icon: Coffee,
    },
    lunch: {
      bn: "দুপুর",
      en: "Lunch",
      time: "11:30 AM – 03:30 PM",
      icon: Sun,
    },
    dinner: {
      bn: "রাত",
      en: "Dinner",
      time: "06:30 PM – 10:30 PM",
      icon: Moon,
    },
  };

  /**
   * Safe payload decoder: extracts { uid, sid, ts, totp } from raw string or Base64
   */
  const parseQRPayload = (decodedText: string): DynamicQRPayload | null => {
    try {
      // 1. Attempt direct JSON parse
      if (decodedText.startsWith("{") && decodedText.endsWith("}")) {
        const parsed = JSON.parse(decodedText);
        if (parsed.sid || parsed.student_id || parsed.uid) {
          return {
            uid: parsed.uid || parsed.user_id || "",
            sid: parsed.sid || parsed.student_id || "",
            ts: parsed.ts || Math.floor(Date.now() / 1000),
            totp: parsed.totp || "",
          };
        }
      }

      // 2. Attempt Base64 decode
      try {
        const decodedBase64 = atob(decodedText.trim());
        const parsedB64 = JSON.parse(decodedBase64);
        if (parsedB64.sid || parsedB64.student_id || parsedB64.uid) {
          return {
            uid: parsedB64.uid || parsedB64.user_id || "",
            sid: parsedB64.sid || parsedB64.student_id || "",
            ts: parsedB64.ts || Math.floor(Date.now() / 1000),
            totp: parsedB64.totp || "",
          };
        }
      } catch {
        // Not Base64
      }

      // 3. Fallback: plain student ID string
      return {
        uid: "",
        sid: decodedText.replace(/[^0-9a-zA-Z]/g, "").slice(0, 15),
        ts: Math.floor(Date.now() / 1000),
        totp: "",
      };
    } catch {
      return null;
    }
  };

  /**
   * Close verification modal and re-enable camera scanning
   */
  const handleCloseVerificationModal = useCallback(() => {
    setIsVerificationModalOpen(false);
    setTimeout(() => {
      isThrottledRef.current = false;
      setScanNotice(null);
    }, 250);
  }, []);

  /**
   * Submit scan payload to /api/counter/verify and trigger instant feedback modal
   */
  const executeVerification = useCallback(
    async (payload: DynamicQRPayload, rawDecodedText: string) => {
      setIsVerifying(true);
      try {
        const response = await fetch("/api/counter/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "qr",
            meal_type: activeShift,
            qr_payload: rawDecodedText,
            student_id: payload.sid,
            totp: payload.totp,
            ts: payload.ts,
          }),
        });

        const result: CounterVerificationResponse = await response.json();

        if (response.status === 200 && result.success && result.data) {
          setVerificationResult({
            status: "success",
            student: result.data,
            meal_type: activeShift,
          });
          setIsVerificationModalOpen(true);
        } else if (response.status === 409 || result.error?.includes("already_claimed")) {
          setVerificationResult({
            status: "duplicate",
            student: result.data || {
              student_id: payload.sid,
              full_name: "নিবন্ধিত শিক্ষার্থী (Student)",
              meal_type: activeShift,
            },
            claimed_at: result.claimed_at,
            meal_type: activeShift,
          });
          setIsVerificationModalOpen(true);
        } else {
          setVerificationResult({
            status: "invalid",
            student: result.data,
            error_message: result.error || "অবৈধ বা মেয়াদোত্তীর্ণ কিউআর টোকেন!",
            meal_type: activeShift,
          });
          setIsVerificationModalOpen(true);
        }
      } catch (err: unknown) {
        setVerificationResult({
          status: "network_error",
          error_message: "সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।",
          meal_type: activeShift,
        });
        setIsVerificationModalOpen(true);
      } finally {
        setIsVerifying(false);
      }
    },
    [activeShift]
  );

  /**
   * Handle decoded QR code with throttle pipeline and instant verification trigger
   */
  const handleDecodedQR = useCallback((decodedText: string) => {
    // Prevent duplicate scans within throttle window or while feedback modal is open
    if (isThrottledRef.current || isVerificationModalOpen) return;
    isThrottledRef.current = true;

    const payload = parseQRPayload(decodedText);
    if (!payload || !payload.sid) {
      if (!isSoundMuted) playFeedback("warning");
      setVerificationResult({
        status: "invalid",
        error_message: "অকার্যকর কিউআর কোড! / Invalid QR Code format",
        meal_type: activeShift,
      });
      setIsVerificationModalOpen(true);
      return;
    }

    setLastScannedPayload(payload);
    setScanNotice(`যাচাই করা হচ্ছে: ID ${payload.sid} • Shift: ${activeShift.toUpperCase()}`);

    // Verification Controller dispatch (Ready for Task 8 & Task 10)
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("bup:scan_received", {
          detail: {
            payload,
            mealType: activeShift,
            raw: decodedText,
            timestamp: Date.now(),
          },
        })
      );
    }

    // Trigger instant verification request
    executeVerification(payload, decodedText);
  }, [activeShift, isSoundMuted, isVerificationModalOpen, executeVerification]);

  /**
   * Initialize html5-qrcode camera stream
   */
  const startCamera = useCallback(async () => {
    setScannerStatus("initializing");
    setErrorMessage(null);

    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("kiosk-qr-reader", {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      }

      const qrCode = html5QrCodeRef.current;

      // Check if already running
      if (qrCode.isScanning) {
        await qrCode.stop().catch(() => {});
      }

      // Camera config: Mobile back camera (environment)
      const cameraConfig = {
        facingMode: "environment" as const,
      };

      const qrConfig = {
        fps: 24, // Optimized frame rate for smooth kiosk performance
        qrbox: { width: 260, height: 260 },
        aspectRatio: window.innerHeight / window.innerWidth,
      };

      await qrCode.start(
        cameraConfig,
        qrConfig,
        (decodedText) => {
          if (isMountedRef.current) {
            handleDecodedQR(decodedText);
          }
        },
        () => {
          // Continuous frame scan error - suppress to keep console clean
        }
      );

      if (isMountedRef.current) {
        setScannerStatus("running");
        
        // Check torch capability
        try {
          const stream = qrCode.getRunningTrackCameraCapabilities();
          if (stream?.torchFeature && stream.torchFeature().isSupported()) {
            setHasTorch(true);
          }
        } catch {
          // Torch check optional
        }
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      setScannerStatus("error");

      const errString = String(err).toLowerCase();
      if (errString.includes("notallowederror") || errString.includes("permission denied")) {
        setErrorMessage({
          bn: "ক্যামেরা ব্যবহারের অনুমতি দেওয়া হয়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে গিয়ে ক্যামেরার অনুমতি দিন।",
          en: "Camera permission denied. Please allow camera access in your browser settings to scan QR passes.",
        });
      } else if (errString.includes("notfounderror") || errString.includes("no camera")) {
        setErrorMessage({
          bn: "ডিভাইসে কোনো ব্যাক ক্যামেরা খুঁজে পাওয়া যায়নি।",
          en: "No rear camera detected on this device.",
        });
      } else {
        setErrorMessage({
          bn: "ক্যামেরা ফিড চালু করতে সমস্যা হয়েছে। রিফ্রেশ করে পুনরায় চেষ্টা করুন বা ম্যানুয়াল পিন ব্যবহার করুন।",
          en: "Failed to initialize camera viewfinder. Retry or use Dead-Battery PIN fallback.",
        });
      }
    }
  }, [handleDecodedQR]);

  /**
   * Stop camera on unmount or pause
   */
  const stopCamera = useCallback(async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        setScannerStatus("paused");
      } catch {
        // ignore stop errors
      }
    }
  }, []);

  // Mount effect
  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  /**
   * Toggle Torch / Flashlight
   */
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !hasTorch) return;
    try {
      const nextTorch = !isTorchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
      });
      setIsTorchOn(nextTorch);
    } catch {
      // ignore
    }
  };

  /**
   * Open Dead-Battery Keypad Modal
   */
  const handleOpenKeypad = () => {
    playFeedback("click");
    stopCamera();
    setIsKeypadModalOpen(true);
  };

  /**
   * Close Keypad Modal & Resume Camera
   */
  const handleCloseKeypad = () => {
    playFeedback("click");
    setIsKeypadModalOpen(false);
    startCamera();
  };

  return (
    <div className="relative w-full h-[100dvh] bg-black overflow-hidden flex flex-col select-none touch-none">
      
      {/* ================================================================== */}
      {/* 1. FULL-VIEWPORT CAMERA FEED                                       */}
      {/* ================================================================== */}
      <div 
        id="kiosk-qr-reader" 
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
        style={{
          backgroundColor: "#000000",
        }}
      />

      {/* Camera Video Overlay Stylings */}
      <style jsx global>{`
        #kiosk-qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          position: absolute !important;
          inset: 0 !important;
        }
        #kiosk-qr-reader__scan_region {
          display: none !important;
        }
        #kiosk-qr-reader__dashboard {
          display: none !important;
        }
      `}</style>

      {/* ================================================================== */}
      {/* HIGH-VISIBILITY CENTRED RETICLE & ANIMATED LASER SCANNER           */}
      {/* ================================================================== */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none p-4">
        {/* Darkened Vignette Mask surrounding the Reticle */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
          
          {/* High-visibility Reticle Frame with Rounded Emerald Corners */}
          <div className="absolute inset-0 rounded-3xl border-2 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
            {/* Top-Left Corner Bracket */}
            <div className="absolute -top-1.5 -left-1.5 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl shadow-[0_0_12px_#34d399]" />
            {/* Top-Right Corner Bracket */}
            <div className="absolute -top-1.5 -right-1.5 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl shadow-[0_0_12px_#34d399]" />
            {/* Bottom-Left Corner Bracket */}
            <div className="absolute -bottom-1.5 -left-1.5 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl shadow-[0_0_12px_#34d399]" />
            {/* Bottom-Right Corner Bracket */}
            <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl shadow-[0_0_12px_#34d399]" />
          </div>

          {/* Continuous Animated Scanning Laser Line */}
          {scannerStatus === "running" && (
            <div className="absolute inset-x-3 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_16px_#10b981] animate-qr-scan z-20" />
          )}

          {/* Center Target Dot */}
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_#10b981]" />

          {/* Prompt text below reticle */}
          <div className="absolute -bottom-10 inset-x-0 text-center">
            <span className="inline-block px-3 py-1 rounded-full bg-black/75 backdrop-blur-md border border-slate-700/80 text-slate-200 text-xs font-semibold font-bengali tracking-wide shadow-lg">
              কিউআর কোড ফ্রেমের মাঝে রাখুন
            </span>
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. ACTIVE MEAL SHIFT SELECTOR BAR (TOP BAR)                       */}
      {/* ================================================================== */}
      <header className="relative z-20 w-full px-3.5 pt-3 pb-2 flex flex-col space-y-2.5 bg-gradient-to-b from-black/90 via-black/60 to-transparent">
        <div className="flex items-center justify-between">
          
          {/* Back Navigation & Kiosk Badge */}
          <div className="flex items-center space-x-2">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 backdrop-blur-md transition-colors"
              title="Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-emerald-500/40 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-400 font-mono tracking-wider">
                KIOSK SCANNER
              </span>
            </div>
          </div>

          {/* Quick Utility Toggles (Torch & Mute) */}
          <div className="flex items-center space-x-2">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={cn(
                  "p-2 rounded-xl border backdrop-blur-md transition-colors",
                  isTorchOn
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-amber-glow"
                    : "bg-slate-900/80 text-slate-400 border-slate-700/80"
                )}
                title="Toggle Torch"
              >
                <Zap className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSoundMuted(!isSoundMuted)}
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80 backdrop-blur-md transition-colors"
              title={isSoundMuted ? "Unmute" : "Mute"}
            >
              {isSoundMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          </div>
        </div>

        {/* 3-Way Responsive Meal Shift Selector Bar */}
        <div className="w-full grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-950/85 backdrop-blur-xl border border-slate-800 shadow-xl">
          {(["breakfast", "lunch", "dinner"] as MealType[]).map((shiftKey) => {
            const isSelected = activeShift === shiftKey;
            const config = shiftLabels[shiftKey];
            const IconComponent = config.icon;

            return (
              <button
                key={shiftKey}
                type="button"
                onClick={() => {
                  playFeedback("click");
                  setActiveShift(shiftKey);
                }}
                className={cn(
                  "flex items-center justify-center space-x-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-200 select-none",
                  isSelected
                    ? "bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-[1.02]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                )}
              >
                <IconComponent className={cn("w-3.5 h-3.5", isSelected ? "text-slate-950" : "text-emerald-400")} />
                <span className="font-bengali truncate">{config.bn} ({config.en})</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ================================================================== */}
      {/* 3. SCAN NOTIFICATION POPUP (THROTTLED FEEDBACK)                    */}
      {/* ================================================================== */}
      {scanNotice && (
        <div className="absolute top-28 inset-x-4 z-30 flex justify-center pointer-events-none animate-bounce">
          <div className="px-4 py-2.5 rounded-2xl bg-emerald-950/95 border border-emerald-400/80 text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.5)] flex items-center space-x-2 text-xs sm:text-sm font-bold font-bengali backdrop-blur-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>{scanNotice}</span>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* CAMERA ERROR & PERMISSION FALLBACK STATE                           */}
      {/* ================================================================== */}
      {scannerStatus === "error" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-crimson-glow">
            <CameraOff className="w-8 h-8" />
          </div>

          <div className="space-y-2 max-w-sm">
            <h2 className="text-base font-bold text-slate-100 font-bengali">
              ক্যামেরা অ্যাক্সেস করা যায়নি
            </h2>
            <p className="text-xs text-rose-300 font-bengali leading-relaxed">
              {errorMessage?.bn || "ক্যামেরা চালু করা সম্ভব হচ্ছে না।"}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              {errorMessage?.en || "Camera feed initialization failed."}
            </p>
          </div>

          <div className="flex flex-col w-full max-w-xs space-y-2.5 pt-2">
            <button
              type="button"
              onClick={startCamera}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center space-x-2 shadow-emerald-glow transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="font-bengali">পুনরায় ক্যামেরা চালু করুন (Retry Camera)</span>
            </button>

            <button
              type="button"
              onClick={handleOpenKeypad}
              className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center justify-center space-x-2 transition-all font-bengali"
            >
              <Keyboard className="w-4 h-4 text-emerald-400" />
              <span>ম্যানুয়াল পিন দিয়ে মিল দিন (Enter PIN)</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 4. BOTTOM ACTION DOCK (DEAD BATTERY KEYPAD TRIGGER)                 */}
      {/* ================================================================== */}
      <footer className="mt-auto relative z-20 w-full px-4 pb-6 pt-3 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="w-full max-w-md mx-auto">
          {/* Large High-Contrast Dead Phone Action Button */}
          <button
            type="button"
            onClick={handleOpenKeypad}
            className="w-full py-4 px-5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:scale-[0.98] border-2 border-slate-700/90 hover:border-emerald-500/50 shadow-2xl backdrop-blur-xl flex items-center justify-center space-x-3 text-white transition-all group"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 group-hover:bg-emerald-500/30 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 transition-colors">
              <Keyboard className="w-5 h-5 text-emerald-400" />
            </div>

            <div className="text-left leading-tight truncate">
              <div className="text-xs sm:text-sm font-bold text-slate-100 font-bengali group-hover:text-emerald-300 transition-colors">
                ফোন বন্ধ? পিন দিয়ে মিল দিন
              </div>
              <div className="text-[11px] text-slate-400 font-sans tracking-wide">
                Dead Phone? Enter PIN
              </div>
            </div>
          </button>
        </div>
      </footer>

      {/* ================================================================== */}
      {/* DEAD BATTERY KEYPAD MODAL (TASK 9)                                  */}
      {/* ================================================================== */}
      <DeadBatteryModal
        isOpen={isKeypadModalOpen}
        onClose={handleCloseKeypad}
        activeShift={activeShift}
        onPauseCamera={stopCamera}
        onResumeCamera={startCamera}
        onSuccess={(verifiedStudentData) => {
          setVerificationResult({
            status: "success",
            student: verifiedStudentData,
            meal_type: activeShift,
          });
          setIsVerificationModalOpen(true);
        }}
      />

      {/* ================================================================== */}
      {/* 5. VERIFICATION RESULT FEEDBACK MODAL (TASK 8)                     */}
      {/* ================================================================== */}
      <CounterVerificationModal
        isOpen={isVerificationModalOpen}
        onClose={handleCloseVerificationModal}
        result={verificationResult}
        onRetry={handleCloseVerificationModal}
      />
    </div>
  );
}
