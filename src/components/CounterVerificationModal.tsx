"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Coffee,
  Sun,
  Moon,
  Utensils,
  RefreshCw,
  X,
  ShieldAlert,
  Building,
  Hash
} from "lucide-react";
import { MealType, HallType } from "@/types";
import { playFeedback } from "@/lib/audio-feedback";
import { useTranslation } from "@/context/LocaleContext";
import { cn } from "@/lib/utils";

/**
 * Pixel-perfect AlertOctagon icon matching Lucide specification
 */
function AlertOctagon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export type VerificationState = "success" | "duplicate" | "invalid" | "network_error";

export interface StudentVerificationInfo {
  student_id: string;
  full_name: string;
  hall?: HallType;
  room_number?: string;
  profile_photo_url?: string | null;
  claimed_at?: string;
  meal_type?: MealType;
  department?: string;
}

export interface VerificationModalData {
  status: VerificationState;
  student?: StudentVerificationInfo | null;
  claimed_at?: string | null;
  meal_type?: MealType;
  error_message?: {
    bn: string;
    en: string;
  } | string;
}

export interface CounterVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: VerificationModalData | null;
  onRetry?: () => void;
  /** Optional custom duration override for success state (defaults to 2500ms) */
  successDurationMs?: number;
  /** Optional custom duration override for duplicate state (defaults to 4000ms) */
  duplicateDurationMs?: number;
}

/**
 * Converts English digits to Bengali digits
 */
function toBengaliDigits(str: string | number): string {
  const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(str).replace(/[0-9]/g, (d) => bnDigits[parseInt(d, 10)]);
}

/**
 * Robustly formats meal claim timestamp into BST (Asia/Dhaka) with Bengali & English
 * Format requested: "পূর্বে গ্রহণের সময়: দুপুর ১:১২ মিনিট / Previously claimed at: 1:12 PM"
 */
function formatClaimTime(claimedAt?: string | number | null): {
  bnTime: string;
  enTime: string;
  combined: string;
} {
  if (!claimedAt) {
    return {
      bnTime: "পূর্বে রেকর্ডকৃত সময় পাওয়া যায়নি",
      enTime: "Time not recorded",
      combined: "পূর্বে গ্রহণের সময়: পূর্বে রেকর্ডকৃত / Previously claimed",
    };
  }

  // If already formatted with bilingual text
  if (typeof claimedAt === "string" && (claimedAt.includes("পূর্বে") || claimedAt.includes("/"))) {
    return {
      bnTime: claimedAt,
      enTime: claimedAt,
      combined: claimedAt,
    };
  }

  try {
    const date = new Date(claimedAt);
    if (isNaN(date.getTime())) {
      const safeStr = String(claimedAt);
      return {
        bnTime: safeStr,
        enTime: safeStr,
        combined: `পূর্বে গ্রহণের সময়: ${safeStr} / Previously claimed at: ${safeStr}`,
      };
    }

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour")?.value || "1";
    const minutePart = parts.find((p) => p.type === "minute")?.value || "00";
    const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value || "PM";
    const hourNum = parseInt(hourPart, 10);
    const isPM = dayPeriod.toUpperCase() === "PM";
    const militaryHour = (hourNum % 12) + (isPM ? 12 : 0);

    // Bengali day period
    let bnPeriod = "দুপুর";
    if (militaryHour >= 5 && militaryHour < 12) {
      bnPeriod = "সকাল";
    } else if (militaryHour >= 12 && militaryHour < 15) {
      bnPeriod = "দুপুর";
    } else if (militaryHour >= 15 && militaryHour < 18) {
      bnPeriod = "বিকাল";
    } else if (militaryHour >= 18 && militaryHour < 20) {
      bnPeriod = "সন্ধ্যা";
    } else {
      bnPeriod = "রাত";
    }

    const bnHour = toBengaliDigits(hourNum);
    const bnMinute = toBengaliDigits(minutePart);
    const bnTimeStr = `${bnPeriod} ${bnHour}:${bnMinute} মিনিট`;
    const enTimeStr = `${hourNum}:${minutePart} ${dayPeriod.toUpperCase()}`;

    return {
      bnTime: `পূর্বে গ্রহণের সময়: ${bnTimeStr}`,
      enTime: `Previously claimed at: ${enTimeStr}`,
      combined: `পূর্বে গ্রহণের সময়: ${bnTimeStr} / Previously claimed at: ${enTimeStr}`,
    };
  } catch {
    const safeStr = String(claimedAt);
    return {
      bnTime: safeStr,
      enTime: safeStr,
      combined: `পূর্বে গ্রহণের সময়: ${safeStr} / Previously claimed at: ${safeStr}`,
    };
  }
}

/**
 * Meal Shift Badge helper
 */
function getShiftBadgeDetails(shift?: MealType) {
  switch (shift) {
    case "breakfast":
      return {
        bn: "সকাল (Breakfast)",
        en: "Breakfast",
        icon: Coffee,
        bg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
      };
    case "dinner":
      return {
        bn: "রাত (Dinner)",
        en: "Dinner",
        icon: Moon,
        bg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
      };
    case "lunch":
    default:
      return {
        bn: "দুপুর (Lunch)",
        en: "Lunch",
        icon: Sun,
        bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
      };
  }
}

export default function CounterVerificationModal({
  isOpen,
  onClose,
  result,
  onRetry,
  successDurationMs = 2500,
  duplicateDurationMs = 4000,
}: CounterVerificationModalProps) {
  const { t, locale, isBengali } = useTranslation();
  const [photoError, setPhotoError] = useState(false);
  const [progressPercent, setProgressPercent] = useState(100);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const status = result?.status || "invalid";
  const student = result?.student;
  const currentShift = result?.meal_type || student?.meal_type || "lunch";
  const shiftBadge = getShiftBadgeDetails(currentShift);
  const ShiftIcon = shiftBadge.icon;

  // Format previous claim time for duplicate/fraud alert
  const claimTimeDetails = useMemo(() => {
    const rawTime = result?.claimed_at || student?.claimed_at;
    return formatClaimTime(rawTime);
  }, [result?.claimed_at, student?.claimed_at]);

  // Reset photo error state when student changes
  useEffect(() => {
    setPhotoError(false);
  }, [student?.student_id, student?.profile_photo_url]);

  // Audio and Tactile triggers on mount / state change
  useEffect(() => {
    if (!isOpen || !result) return;

    if (status === "success") {
      // 1. Synthesize cheerful high two-tone chime via Web Audio
      playFeedback("success");
      // 2. Fire single tactile haptic pulse: 40ms
      if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
        try {
          navigator.vibrate([40]);
        } catch {
          // ignore vibration errors
        }
      }
    } else if (status === "duplicate") {
      // 1. Synthesize low double-buzz alert via Web Audio
      playFeedback("error");
      // 2. Fire aggressive double haptic pulse: [100, 50, 100]
      if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
        try {
          navigator.vibrate([100, 50, 100]);
        } catch {
          // ignore
        }
      }
    } else {
      // Invalid / Network Error state
      playFeedback("warning");
      if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
        try {
          navigator.vibrate([60, 40, 60]);
        } catch {
          // ignore
        }
      }
    }
  }, [isOpen, result, status]);

  // Auto-dismiss countdown timer logic
  useEffect(() => {
    if (!isOpen || !result) {
      setProgressPercent(100);
      return;
    }

    // Determine target countdown duration:
    // Success: 2.5 seconds
    // Duplicate: 4.0 seconds (staff can tap dismiss or auto-closes)
    // Invalid / Network Error: manual dismiss via retry button
    let duration = 0;
    if (status === "success") {
      duration = successDurationMs;
    } else if (status === "duplicate") {
      duration = duplicateDurationMs;
    } else {
      setProgressPercent(100);
      return;
    }

    startTimeRef.current = performance.now();
    setProgressPercent(100);

    const updateProgress = (now: number) => {
      if (!startTimeRef.current) return;
      const elapsed = now - startTimeRef.current;
      const remainingRatio = Math.max(0, 1 - elapsed / duration);
      setProgressPercent(remainingRatio * 100);

      if (elapsed >= duration) {
        onClose();
      } else {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, result, status, successDurationMs, duplicateDurationMs, onClose]);

  if (!isOpen || !result) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="counter-verification-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md transition-opacity duration-200 select-none touch-none"
      style={{
        // Zero layout shift guarantee: overlay rendered in fixed viewport coordinates
        contain: "paint layout",
      }}
    >
      {/* ================================================================== */}
      {/* 1. SUCCESS STATE (GREEN SCREEN - INSTANT VERIFICATION)             */}
      {/* ================================================================== */}
      {status === "success" && (
        <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-slate-950/95 border-2 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.35)] flex flex-col animate-in zoom-in-95 duration-200">
          
          {/* Top Emerald Header Glow Bar */}
          <div className="w-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-5 py-2.5 flex items-center justify-between text-slate-950 font-black">
            <div className="flex items-center space-x-2 text-xs sm:text-sm font-mono tracking-wider">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-ping" />
              <span>BUP HALL VERIFIED</span>
            </div>
            
            {/* Shift Badge in Header */}
            <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/20 text-slate-950 text-xs font-bold">
              <ShiftIcon className="w-3.5 h-3.5" />
              <span>{shiftBadge.en.toUpperCase()}</span>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-7 flex flex-col items-center text-center space-y-4 sm:space-y-5">
            
            {/* Animated Status Indicator with Emerald Checkmark */}
            <div className="flex flex-col items-center space-y-1.5">
              <div className="relative flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.5)] animate-pulse">
                {/* SVG Animated Checkmark with glowing ring */}
                <svg
                  className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              {/* Status Indicator Text */}
              <div className="text-center pt-1">
                <h2
                  id="counter-verification-title"
                  className="text-lg sm:text-xl font-extrabold text-emerald-400 font-bengali tracking-wide leading-tight"
                >
                  মিল সফলভাবে নিশ্চিত হয়েছে / Meal Verified
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  {currentShift.toUpperCase()} • {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* Large Passport Photo Frame for Instant Face-Matching */}
            <div className="relative group">
              <div className="w-32 h-40 sm:w-36 sm:h-44 rounded-2xl overflow-hidden border-2 border-emerald-400/90 shadow-[0_0_25px_rgba(16,185,129,0.3)] bg-slate-900 flex items-center justify-center relative">
                {student?.profile_photo_url && !photoError ? (
                  <img
                    src={student.profile_photo_url}
                    alt={student.full_name || "Student Photo"}
                    onError={() => setPhotoError(true)}
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-3 text-slate-500 space-y-2">
                    <User className="w-12 h-12 text-emerald-500/60" />
                    <span className="text-[10px] font-bengali text-slate-400 font-semibold leading-tight">
                      অফিশিয়াল ছবি
                      <br />
                      (No Photo)
                    </span>
                  </div>
                )}

                {/* Face Matching Label Badge */}
                <div className="absolute bottom-0 inset-x-0 py-1 bg-slate-950/85 backdrop-blur-md text-[10px] font-bold text-emerald-300 font-bengali border-t border-emerald-500/30">
                  চেহারা মিলিয়ে নিন (Face Match)
                </div>
              </div>
            </div>

            {/* Student Data Section */}
            <div className="w-full space-y-2.5">
              {/* Full Name: 24px+ bold */}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight px-2 break-words">
                {student?.full_name || "শিক্ষার্থীর নাম / Student"}
              </h1>

              {/* ID & Room Badge Group */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {/* Student ID */}
                <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs sm:text-sm font-mono font-bold shadow-md">
                  <Hash className="w-4 h-4 text-emerald-400" />
                  <span>ID: {student?.student_id || "N/A"}</span>
                </div>

                {/* Assigned Room Number */}
                <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs sm:text-sm font-bold shadow-md font-bengali">
                  <Building className="w-4 h-4 text-emerald-400" />
                  <span>রুম: {student?.room_number ? toBengaliDigits(student.room_number) : "N/A"} ({student?.room_number || "N/A"})</span>
                </div>

                {/* Current Meal Shift Badge */}
                <div className={cn("inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-bold shadow-md", shiftBadge.bg)}>
                  <ShiftIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="font-bengali">{shiftBadge.bn}</span>
                </div>
              </div>

              {/* Hall Information */}
              {student?.hall && (
                <div className="text-xs text-slate-400 font-medium font-bengali pt-1">
                  {student.hall === "female" ? "বিইউপি ছাত্রী হল (BUP Female Hall)" : "বিইউপি ছাত্র হল (BUP Male Hall)"}
                </div>
              )}
            </div>

            {/* Auto-Dismiss Notice */}
            <div className="text-[11px] text-slate-400 font-mono flex items-center justify-center space-x-1.5 pt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>স্বয়ংক্রিয়ভাবে পরবর্তী স্ক্যানে যাচ্ছে... (2.5s Auto-Dismiss)</span>
            </div>
          </div>

          {/* 2.5-Second Auto-Dismiss Animated Countdown Progress Bar */}
          <div className="w-full h-2 bg-slate-900 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_#10b981] transition-all ease-linear"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 2. DUPLICATE / FRAUD STATE (RED SCREEN - ALREADY CONSUMED)          */}
      {/* ================================================================== */}
      {status === "duplicate" && (
        <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-rose-950/95 border-2 border-rose-500 shadow-[0_0_55px_rgba(244,63,94,0.45)] flex flex-col animate-in zoom-in-95 duration-200">
          
          {/* Crimson Emergency Strobe Top Bar */}
          <div className="w-full bg-rose-600 px-5 py-2.5 flex items-center justify-between text-white font-black animate-pulse">
            <div className="flex items-center space-x-2 text-xs sm:text-sm font-mono tracking-wider">
              <ShieldAlert className="w-4 h-4 text-white" />
              <span>SECURITY ALERT: DUPLICATE MEAL</span>
            </div>
            <div className="text-xs font-mono font-bold bg-slate-950/40 px-2 py-0.5 rounded">
              FRAUD PREVENTION
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-7 flex flex-col items-center text-center space-y-4 sm:space-y-5">
            
            {/* Flashing Large AlertOctagon Icon */}
            <div className="relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-rose-500/20 border-2 border-rose-400 text-rose-400 shadow-[0_0_40px_rgba(244,63,94,0.6)] animate-bounce">
              <AlertOctagon className="w-12 h-12 sm:w-14 sm:h-14 text-rose-400 animate-pulse" />
            </div>

            {/* Headline: 30px bold */}
            <div className="space-y-1">
              <h1
                id="counter-verification-title"
                className="text-2xl sm:text-[30px] font-black text-rose-200 font-bengali tracking-tight leading-tight"
              >
                ইতিমধ্যে নেওয়া হয়েছে! / Already Claimed!
              </h1>
              <p className="text-xs text-rose-300 font-semibold font-sans">
                This meal allocation has already been logged and consumed for this shift.
              </p>
            </div>

            {/* Exact Previous Claim Time Banner */}
            <div className="w-full px-4 py-3 rounded-2xl bg-rose-900/80 border border-rose-400/60 text-white shadow-lg space-y-1">
              <div className="flex items-center justify-center space-x-1.5 text-xs text-rose-300 font-bold uppercase tracking-wider font-mono">
                <Clock className="w-4 h-4 text-rose-300 flex-shrink-0" />
                <span>পূর্ববর্তী লগইন রেকর্ড (Previous Log)</span>
              </div>
              <div className="text-sm sm:text-base font-extrabold text-white font-bengali leading-snug">
                {claimTimeDetails.combined}
              </div>
            </div>

            {/* Render Account Owner Photo & Name for Cross-Check */}
            <div className="w-full flex items-center space-x-3.5 p-3 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-left">
              <div className="w-16 h-20 rounded-xl overflow-hidden border border-rose-400/60 bg-slate-950 flex-shrink-0 flex items-center justify-center">
                {student?.profile_photo_url && !photoError ? (
                  <img
                    src={student.profile_photo_url}
                    alt={student.full_name || "Student"}
                    onError={() => setPhotoError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-rose-400/60" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-rose-400 font-bold uppercase font-mono tracking-wider">
                  অ্যাকাউন্ট মালিক (Account Owner)
                </div>
                <div className="text-base sm:text-lg font-bold text-white truncate font-sans">
                  {student?.full_name || "নাম পাওয়া যায়নি (Unknown)"}
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  ID: <span className="text-rose-300 font-bold">{student?.student_id || "N/A"}</span>
                  {student?.room_number && (
                    <span className="ml-2">| Room: {student.room_number}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Prominent Dismiss Button & Auto-Close Timer */}
            <div className="w-full flex flex-col space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  playFeedback("click");
                  onClose();
                }}
                className="w-full py-4 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-sm sm:text-base font-bengali shadow-[0_0_25px_rgba(244,63,94,0.5)] transition-all flex items-center justify-center space-x-2"
              >
                <span>ঠিক আছে / Dismiss</span>
              </button>

              <div className="text-[11px] text-rose-300/80 font-mono text-center">
                সতর্কতা নিশ্চিত করতে ৪ সেকেন্ড পর স্বয়ংক্রিয় বন্ধ হবে
              </div>
            </div>
          </div>

          {/* 4.0-Second Progress Bar Depleting */}
          <div className="w-full h-2 bg-rose-950 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-amber-400 shadow-[0_0_12px_#f43f5e] transition-all ease-linear"
              style={{
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 3. INVALID TOKEN / NETWORK ERROR STATE (AMBER WARNING)             */}
      {/* ================================================================== */}
      {(status === "invalid" || status === "network_error") && (
        <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-amber-950/95 border-2 border-amber-500 shadow-[0_0_50px_rgba(245,158,11,0.35)] flex flex-col animate-in zoom-in-95 duration-200">
          
          {/* Amber Warning Header */}
          <div className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 px-5 py-2.5 flex items-center justify-between text-slate-950 font-black">
            <div className="flex items-center space-x-2 text-xs sm:text-sm font-mono tracking-wider">
              <AlertTriangle className="w-4 h-4 text-slate-950" />
              <span>{status === "network_error" ? "NETWORK TIMEOUT" : "VERIFICATION WARNING"}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-black/20 text-slate-950 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 sm:p-7 flex flex-col items-center text-center space-y-4 sm:space-y-5">
            
            {/* Warning Icon Frame */}
            <div className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-amber-500/20 border-2 border-amber-400 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.4)]">
              <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 animate-pulse" />
            </div>

            {/* Error Message & Details */}
            <div className="space-y-2">
              <h2
                id="counter-verification-title"
                className="text-xl sm:text-2xl font-black text-amber-200 font-bengali tracking-tight"
              >
                {status === "network_error"
                  ? "নেটওয়ার্ক সংযোগে সমস্যা / Connection Timeout"
                  : "অবৈধ কিউআর টোকেন / Invalid or Expired Token"}
              </h2>
              
              <p className="text-xs sm:text-sm text-amber-300 font-bengali leading-relaxed max-w-sm">
                {typeof result?.error_message === "object"
                  ? (isBengali ? result.error_message.bn : result.error_message.en)
                  : (result?.error_message ||
                     (status === "network_error"
                       ? "সার্ভারের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি। অনুগ্রহ করে ইন্টারনেট বা অফলাইন মোড পরীক্ষা করুন।"
                       : "এই কিউআর কোডটির মেয়াদ শেষ হয়েছে অথবা কোডটি সঠিক নয়। শিক্ষার্থীকে পাসটি রিফ্রেশ করতে বলুন।"))}
              </p>

              <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
                {status === "network_error"
                  ? "Server connection timed out. Please retry scanning or check internet connectivity."
                  : "The dynamic QR token has expired (30s window exceeded) or signature is invalid."}
              </p>
            </div>

            {/* Instant Action: Scan Again Button */}
            <div className="w-full flex flex-col space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  playFeedback("click");
                  if (onRetry) {
                    onRetry();
                  } else {
                    onClose();
                  }
                }}
                className="w-full py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-black text-sm sm:text-base font-bengali shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all flex items-center justify-center space-x-2"
              >
                <RefreshCw className="w-5 h-5 flex-shrink-0" />
                <span>পুনরায় স্ক্যান করুন / Scan Again</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playFeedback("click");
                  onClose();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs font-bengali transition-colors"
              >
                বন্ধ করুন (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
