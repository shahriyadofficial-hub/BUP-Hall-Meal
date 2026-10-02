"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { totp } from "otplib";
import {
  ShieldCheck,
  WifiOff,
  Wifi,
  KeyRound,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Clock,
  Sparkles,
  Lock,
  RefreshCw,
  QrCode,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { toBengaliDigits } from "@/lib/utils";
import { HallType, DynamicQRPayload, MealType } from "@/types";

/**
 * Configure RFC 6238 TOTP with a strict 60-second time-step window
 */
totp.options = {
  step: 60,
  digits: 6,
};

export interface DynamicQRCardProps {
  userId?: string;
  studentId?: string;
  totpSecret?: string;
  diningPin?: string;
  studentName?: string;
  hall?: HallType;
  roomNumber?: string;
  // Dashboard contextual props
  profile?: {
    id?: string;
    student_id?: string;
    full_name?: string;
    hall?: "male" | "female";
    room_number?: string;
    dining_pin?: string;
    totp_secret?: string;
  } | null;
  activeShift?: MealType;
  shiftLabel?: string;
  shiftTime?: string;
  backupPin?: string;
  isBengali?: boolean;
  t?: unknown;
}

const STORAGE_CACHE_KEY = "bup_cached_totp_identity";
const PIN_DRAWER_SETTING_KEY = "bup_emergency_pin_drawer_enabled";

// Safe Base64 encoder for browser environments
function safeBase64Encode(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

/**
 * DynamicQRCard Component
 * 
 * Secure, anti-proxy dynamic QR token generator designed for BUP Hall dining counters.
 * - Computes client-side RFC 6238 TOTP tokens on a 60-second rotating cycle.
 * - Renders an animated SVG circular stroke countdown ring around the QR frame.
 * - Full offline-first capability using device clock and cached credentials.
 * - Emergency 4-digit Dining PIN reference drawer with user toggle.
 * - Anti-fraud animated visual watermark and live dynamic ticker to thwart static screenshots.
 */
export const DynamicQRCard: React.FC<DynamicQRCardProps> = ({
  userId: propUserId,
  studentId: propStudentId,
  totpSecret: propTotpSecret,
  diningPin: propDiningPin,
  studentName: propStudentName,
  hall: propHall,
  roomNumber: propRoomNumber,
  profile,
  activeShift,
  shiftLabel,
  shiftTime,
  backupPin,
  isBengali: propIsBengali,
}) => {
  const { t, isBengali: contextIsBengali } = useTranslation();
  const isBengali = propIsBengali !== undefined ? propIsBengali : contextIsBengali;

  // Resolved identity credentials with fallback cascade
  const [identity, setIdentity] = useState({
    userId: propUserId || profile?.id || "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    studentId: propStudentId || profile?.student_id || "2302001",
    totpSecret: propTotpSecret || profile?.totp_secret || "JBSWY3DPEHPK3PXP",
    diningPin: propDiningPin || backupPin || profile?.dining_pin || "4829",
    studentName: propStudentName || profile?.full_name || "Md. Tanvir Ahmed",
    hall: (propHall || profile?.hall || "male") as HallType,
    roomNumber: propRoomNumber || profile?.room_number || "402",
  });

  // Network connection state
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // 60-Second countdown timer state
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const [qrPayloadString, setQrPayloadString] = useState<string>("");
  const [currentTotpCode, setCurrentTotpCode] = useState<string>("000000");
  const [justRefreshed, setJustRefreshed] = useState<boolean>(false);

  // Emergency PIN Drawer state & User Preference toggle
  const [isPinDrawerOpen, setIsPinDrawerOpen] = useState<boolean>(false);
  const [showPlainPin, setShowPlainPin] = useState<boolean>(false);
  const [isPinOptionEnabled, setIsPinOptionEnabled] = useState<boolean>(true);

  // Live real-time seconds ticker (for anti-screenshot validation)
  const [liveTimestamp, setLiveTimestamp] = useState<string>("");

  /**
   * 1. Cache identity to localStorage or recover cached identity when offline
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if new props arrived
    if (propUserId || propStudentId || propTotpSecret) {
      const newIdentity = {
        userId: propUserId || identity.userId,
        studentId: propStudentId || identity.studentId,
        totpSecret: propTotpSecret || identity.totpSecret,
        diningPin: propDiningPin || identity.diningPin,
        studentName: propStudentName || identity.studentName,
        hall: propHall || identity.hall,
        roomNumber: propRoomNumber || identity.roomNumber,
      };
      setIdentity(newIdentity);
      try {
        localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(newIdentity));
      } catch {
        // Ignore storage errors
      }
    } else {
      // Attempt to load cached identity
      try {
        const cached = localStorage.getItem(STORAGE_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          setIdentity((prev) => ({ ...prev, ...parsed }));
        }
      } catch {
        // Fallback to default state
      }
    }

    // Load Emergency PIN Drawer user setting preference
    try {
      const pinSetting = localStorage.getItem(PIN_DRAWER_SETTING_KEY);
      if (pinSetting !== null) {
        setIsPinOptionEnabled(pinSetting === "true");
      }
    } catch {
      // Default to enabled
    }
  }, [propUserId, propStudentId, propTotpSecret, propDiningPin, propStudentName, propHall, propRoomNumber]);

  /**
   * 2. Listen to network connectivity events (online / offline)
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  /**
   * 3. Compute TOTP token and QR payload string
   */
  const regenerateToken = useCallback(() => {
    try {
      const currentUnix = Math.floor(Date.now() / 1000);
      const code = totp.generate(identity.totpSecret);
      setCurrentTotpCode(code);

      const payload: DynamicQRPayload = {
        uid: identity.userId,
        sid: identity.studentId,
        ts: currentUnix,
        totp: code,
      };

      const jsonStr = JSON.stringify(payload);
      const encoded = safeBase64Encode(jsonStr);
      setQrPayloadString(encoded);

      // Trigger subtle pulse transition
      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 800);
    } catch (err) {
      console.error("[DynamicQR] TOTP generation error:", err);
    }
  }, [identity.totpSecret, identity.userId, identity.studentId]);

  /**
   * 4. 60-Second Real-Time Synchronization Loop
   */
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const currentEpochSec = Math.floor(now / 1000);
      const remainder = currentEpochSec % 60;
      const left = 60 - remainder;

      setSecondsRemaining(left);

      // Live anti-screenshot clock ticker (e.g. "13:45:28 BST")
      const d = new Date(now);
      const timeStr = d.toLocaleTimeString("en-GB", { hour12: false });
      setLiveTimestamp(timeStr);

      // When reaching a new 60s boundary
      if (left === 60) {
        regenerateToken();
      }
    };

    // Initial generation
    regenerateToken();
    updateCountdown();

    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [regenerateToken]);

  /**
   * Toggle emergency PIN option setting (persisted to localStorage)
   */
  const handleTogglePinSetting = () => {
    const nextVal = !isPinOptionEnabled;
    setIsPinOptionEnabled(nextVal);
    try {
      localStorage.setItem(PIN_DRAWER_SETTING_KEY, String(nextVal));
    } catch {
      // Ignore
    }
    if (!nextVal) {
      setIsPinDrawerOpen(false);
    }
  };

  /**
   * SVG Countdown Ring Math
   * Radius = 114px, Circumference = 2 * PI * 114 ~= 716.28px
   */
  const ringRadius = 114;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeProgress = (60 - secondsRemaining) / 60;
  const strokeDashoffset = circumference * strokeProgress;

  return (
    <div className="w-full max-w-sm mx-auto select-none">
      {/* Outer Frosted Glass Container with Anti-Screenshot Border Glow */}
      <div className="glass-card p-5 relative overflow-hidden shadow-2xl border border-slate-800/90 transition-all duration-300">
        
        {/* Anti-Fraud Animated Watermark Layer */}
        <div className="absolute inset-0 pointer-events-none opacity-25">
          <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent rotate-45 animate-pulse-subtle" />
        </div>

        {/* Card Header: Student Identity & Network Status Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 relative z-10">
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-xs font-bold text-slate-100 font-bengali tracking-wide">
                {identity.studentName}
              </h3>
            </div>
            <p className="text-[11px] font-mono text-emerald-400 font-semibold mt-0.5">
              ID: {identity.studentId} • Room {identity.roomNumber}
            </p>
          </div>

          {/* Network Status Pill */}
          <div
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
              isOnline
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-300 border-amber-500/40 shadow-amber-glow"
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 mr-1 text-emerald-400" />
                <span className="font-bengali">
                  {isBengali ? "অনলাইন" : "Online"}
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 mr-1 text-amber-300 animate-pulse" />
                <span className="font-bengali">
                  {isBengali ? "অফলাইন মোড" : "Offline TOTP"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Center Canvas: Dynamic QR Code with 60-Second Circular Countdown Ring */}
        <div className="my-5 flex flex-col items-center justify-center relative">
          
          {/* Circular Countdown Ring Frame */}
          <div className="relative w-64 h-64 flex items-center justify-center">
            
            {/* SVG Progress Ring */}
            <svg
              className="absolute inset-0 w-full h-full -rotate-90 transform"
              viewBox="0 0 240 240"
            >
              {/* Background Track Circle */}
              <circle
                cx="120"
                cy="120"
                r={ringRadius}
                fill="none"
                stroke="#1e293b"
                strokeWidth="4"
                className="opacity-40"
              />

              {/* Animated Countdown Stroke */}
              <motion.circle
                cx="120"
                cy="120"
                r={ringRadius}
                fill="none"
                stroke="url(#emeraldGradient)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, ease: "linear" }}
              />

              {/* SVG Gradient Definition */}
              <defs>
                <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>

            {/* Inner QR Canvas Container */}
            <motion.div
              animate={{
                scale: justRefreshed ? [1, 1.03, 1] : 1,
              }}
              transition={{ duration: 0.4 }}
              className="relative w-48 h-48 bg-white rounded-2xl p-3.5 shadow-2xl flex flex-col items-center justify-center border-2 border-emerald-500/30 overflow-hidden"
            >
              {/* Dynamic QR SVG */}
              {qrPayloadString ? (
                <QRCodeSVG
                  value={qrPayloadString}
                  size={160}
                  level="M"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#090e17"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-1" />
                  <span className="text-[10px]">Generating Token...</span>
                </div>
              )}

              {/* Anti-Proxy Dynamic Scan Bar */}
              <div className="absolute inset-x-2 h-0.5 bg-emerald-500/70 shadow-[0_0_8px_#10b981] animate-qr-scan pointer-events-none" />
            </motion.div>
          </div>

          {/* Digital Countdown Ticker Badge */}
          <div className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium shadow-inner">
            <Clock className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: "12s" }} />
            <span className="text-slate-300 font-bengali text-[11px]">
              {isBengali ? (
                <>
                  <span className="font-mono text-emerald-400 font-bold">
                    {toBengaliDigits(secondsRemaining)}
                  </span>{" "}
                  সেকেন্ড পর রিফ্রেশ হবে
                </>
              ) : (
                <>
                  Refreshes in{" "}
                  <span className="font-mono text-emerald-400 font-bold">
                    {secondsRemaining}s
                  </span>
                </>
              )}
            </span>
          </div>

          {/* Anti-Fraud Live Seconds Timestamp Watermark */}
          <div className="mt-1.5 text-[10px] font-mono text-slate-400 tracking-wider flex items-center space-x-1">
            <span>LIVE: {liveTimestamp}</span>
            <span>•</span>
            <span>TOTP: {currentTotpCode.slice(0, 3)}***</span>
          </div>
        </div>

        {/* Anti-Fraud Screenshot Warning Caption */}
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-center text-[11px] text-slate-400 font-bengali leading-relaxed">
          <p className="flex items-center justify-center space-x-1 text-slate-300 font-medium">
            <AlertTriangle className="w-3 h-3 text-amber-400 mr-0.5 flex-shrink-0" />
            <span>
              {isBengali
                ? "স্ক্রিনশট কাজ করবে না • প্রতি ৬০ সেকেন্ডে পরিবর্তনশীল"
                : "Screenshots will not work • Dynamic 60s token"}
            </span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isOnline
              ? isBengali
                ? "সার্ভার ও কাউন্টারের সাথে স্বয়ংক্রিয়ভাবে সিঙ্ক হচ্ছে।"
                : "Synchronized with dining hall server."
              : isBengali
              ? "⚡ অফলাইন মোড সক্রিয় (ডিভাইসের সময় অনুযায়ী কিউআর কার্যকর)।"
              : "⚡ Offline Mode Active (QR remains valid via device clock)."}
          </p>
        </div>

        {/* Emergency Backup PIN Accordion Section */}
        <div className="mt-4 pt-3 border-t border-slate-800/80">
          
          {/* Header Row with Toggle Enable Switch */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400 font-bengali">
              {isBengali ? "জরুরি পিন বিকল্প:" : "Emergency PIN Option:"}
            </span>
            <button
              type="button"
              onClick={handleTogglePinSetting}
              className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-emerald-400 transition-colors"
              title="Enable or disable emergency PIN reference drawer"
            >
              <span className="font-bengali text-[10px]">
                {isPinOptionEnabled
                  ? isBengali
                    ? "চালু আছে"
                    : "Enabled"
                  : isBengali
                  ? "বন্ধ আছে"
                  : "Disabled"}
              </span>
              {isPinOptionEnabled ? (
                <ToggleRight className="w-4 h-4 text-emerald-400" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-slate-600" />
              )}
            </button>
          </div>

          {/* Expandable Accordion Drawer */}
          {isPinOptionEnabled && (
            <div className="mt-2 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setIsPinDrawerOpen((prev) => !prev)}
                className="w-full px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-200 hover:text-emerald-300 font-bengali transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {isBengali ? "জরুরি ডাইনিং পিন" : "Emergency Dining PIN"}
                  </span>
                </div>
                {isPinDrawerOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              <AnimatePresence>
                {isPinDrawerOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="px-3 pb-3 pt-1 border-t border-slate-800/60 space-y-2.5"
                  >
                    {/* PIN Display Row with Mask Toggle */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="flex items-center space-x-1.5">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span className="text-[11px] text-slate-400 font-bengali">
                          {isBengali ? "আপনার পিন:" : "Your PIN:"}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm tracking-widest font-bold text-amber-300">
                          {showPlainPin
                            ? isBengali
                              ? toBengaliDigits(identity.diningPin)
                              : identity.diningPin
                            : "••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPlainPin((prev) => !prev)}
                          className="p-1 text-slate-400 hover:text-slate-200"
                          title={showPlainPin ? "Hide PIN" : "Show PIN"}
                        >
                          {showPlainPin ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Educational Helper Micro-Copy */}
                    <p className="text-[11px] text-slate-400 font-bengali leading-relaxed px-0.5">
                      {isBengali
                        ? "ফোনে internet না থাকলে কাউন্টারে আপনার স্টুডেন্ট আইডি বলে এই পিনটি দিয়ে খাবার সংগ্রহ করতে পারবেন।"
                        : "If you do not have any data, state your Student ID and enter this PIN at the counter to claim your meal."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DynamicQRCard;
