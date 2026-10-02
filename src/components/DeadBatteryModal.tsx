"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Keyboard,
  X,
  Delete,
  Check,
  User,
  Lock,
  AlertCircle,
  RefreshCw,
  BatteryLow,
  Hash,
  ArrowRight,
} from "lucide-react";
import { MealType, CounterVerificationResponse, CounterVerificationRequest } from "@/types";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { playFeedback } from "@/lib/audio-feedback";
import { toBengaliDigits } from "@/lib/utils";

export interface DeadBatteryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: CounterVerificationResponse["data"]) => void;
  activeShift?: MealType;
  onPauseCamera?: () => void;
  onResumeCamera?: () => void;
}

type ActiveInputTarget = "studentId" | "pin";

/**
 * DeadBatteryModal Component
 * 
 * Ergonomic ATM-style on-screen numeric keypad for dining counter staff.
 * Designed for students whose phones are dead or have no battery/network.
 * 
 * Key Features:
 * 1. Pauses camera feed immediately upon opening.
 * 2. Custom on-screen ATM keypad (0-9, Backspace ⌫, Submit ✓) with min 64px tactile touch targets.
 * 3. readOnly / inputMode="none" strictly preventing mobile software keyboard zoom/popups.
 * 4. 4-box masked PIN display (bullets • only, no plaintext) to ensure anti-shoulder-surfing privacy.
 * 5. Instant dispatch to /api/counter/verify with automatic transition to photo face-matching modal on success.
 */
export const DeadBatteryModal: React.FC<DeadBatteryModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  activeShift = "lunch",
  onPauseCamera,
  onResumeCamera,
}) => {
  const { t, isBengali } = useTranslation();

  // Inputs state
  const [studentId, setStudentId] = useState("");
  const [pin, setPin] = useState("");
  const [activeTarget, setActiveTarget] = useState<ActiveInputTarget>("studentId");

  // Request & Error state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<{ bn: string; en: string } | null>(null);

  /**
   * Pause camera upon modal open, and resume upon close
   */
  useEffect(() => {
    if (isOpen) {
      onPauseCamera?.();
      // Reset form
      setStudentId("");
      setPin("");
      setActiveTarget("studentId");
      setErrorMessage(null);
    } else {
      onResumeCamera?.();
    }
  }, [isOpen, onPauseCamera, onResumeCamera]);

  /**
   * Trigger light tactile haptic vibration (20ms) and audio click
   */
  const triggerKeyHaptics = useCallback(() => {
    if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
      try {
        navigator.vibrate(20);
      } catch {
        // Silently ignore if disabled
      }
    }
    playFeedback("click");
  }, []);

  /**
   * Handle Keypad Digit Press (0–9)
   */
  const handleDigitPress = (digit: string) => {
    triggerKeyHaptics();
    setErrorMessage(null);

    if (activeTarget === "studentId") {
      if (studentId.length < 10) {
        const nextId = studentId + digit;
        setStudentId(nextId);
        // If student ID reaches typical BUP length (7 digits e.g. 2302001), auto-advance to PIN
        if (nextId.length === 7) {
          setActiveTarget("pin");
        }
      }
    } else {
      if (pin.length < 4) {
        const nextPin = pin + digit;
        setPin(nextPin);
      }
    }
  };

  /**
   * Handle Backspace / Delete
   */
  const handleBackspace = () => {
    triggerKeyHaptics();
    setErrorMessage(null);

    if (activeTarget === "pin") {
      if (pin.length > 0) {
        setPin((prev) => prev.slice(0, -1));
      } else {
        // Step back to student ID
        setActiveTarget("studentId");
      }
    } else {
      setStudentId((prev) => prev.slice(0, -1));
    }
  };

  /**
   * Handle Clear Entire Active Field
   */
  const handleClear = () => {
    triggerKeyHaptics();
    setErrorMessage(null);
    if (activeTarget === "pin") {
      setPin("");
    } else {
      setStudentId("");
    }
  };

  /**
   * Verification Dispatch to /api/counter/verify
   */
  const handleSubmit = async () => {
    if (!studentId.trim() || studentId.trim().length < 4) {
      setErrorMessage({
        bn: "সঠিক স্টুডেন্ট আইডি প্রদান করুন (ন্যূনতম ৪ ডিজিট)।",
        en: "Enter a valid Student ID (minimum 4 digits).",
      });
      setActiveTarget("studentId");
      playFeedback("warning");
      return;
    }

    if (pin.length !== 4) {
      setErrorMessage({
        bn: "৪-সংখ্যার ডাইনিং পিন সম্পূর্ণ লিখুন।",
        en: "Enter the full 4-digit dining PIN.",
      });
      setActiveTarget("pin");
      playFeedback("warning");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload: CounterVerificationRequest = {
        mode: "pin",
        meal_type: activeShift,
        fallback_data: {
          student_id: studentId.trim(),
          pin: pin,
        },
      };

      const res = await fetch("/api/counter/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result: CounterVerificationResponse = await res.json();

      if (res.status === 200 && result.success && result.data) {
        // Success: Close keypad modal and mount PhotoMatchModal
        onClose();
        onSuccess(result.data);
      } else if (res.status === 409 || result.error?.includes("already_claimed")) {
        setErrorMessage({
          bn: "সতর্কতা: এই মিলটি আগেই সংগ্রহ করা হয়েছে!",
          en: "Alert: This meal has already been claimed for this shift!",
        });
        playFeedback("reject");
      } else if (res.status === 404 || result.error?.includes("student_not_found")) {
        setErrorMessage({
          bn: "কোনো নিবন্ধিত শিক্ষার্থী পাওয়া যায়নি। আইডি পুনরায় যাচাই করুন।",
          en: "No registered student found with this ID.",
        });
        playFeedback("reject");
      } else if (result.error?.includes("invalid_pin")) {
        setErrorMessage({
          bn: "ভুল ডাইনিং পিন! সঠিক পিন প্রদান করুন।",
          en: "Incorrect dining PIN. Please try again.",
        });
        setPin("");
        playFeedback("reject");
      } else {
        setErrorMessage({
          bn: result.error || "যাচাইকরণ ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।",
          en: result.error || "Verification failed. Please check inputs.",
        });
        playFeedback("reject");
      }
    } catch (err) {
      console.error("[DeadBatteryModal] Error:", err);
      setErrorMessage({
        bn: "সার্ভারের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি।",
        en: "Network error connecting to verification server.",
      });
      playFeedback("reject");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const isFormValid = studentId.trim().length >= 4 && pin.length === 4;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200 select-none">
      {/* Modal Dialog Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[96vh] overflow-y-auto"
      >
        {/* Header Section */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-amber-glow">
              <BatteryLow className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Step 1 • Dead Phone Fallback
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-100 font-bengali mt-0.5 leading-tight">
                {isBengali
                  ? "শিক্ষার্থীর আইডি ও ৪-সংখ্যার ডাইনিং পিন লিখুন"
                  : "Enter Student ID & 4-Digit Dining PIN"}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <LanguageToggle />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              aria-label="Close"
              title="Return to Camera"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Input Fields Section (readOnly to prevent native mobile soft keyboard) */}
        <div className="space-y-3">
          
          {/* Field 1: Student ID Input */}
          <div
            onClick={() => {
              triggerKeyHaptics();
              setActiveTarget("studentId");
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              activeTarget === "studentId"
                ? "bg-slate-950 border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-glow"
                : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold mb-1">
              <span className="flex items-center space-x-1.5 text-slate-300 font-bengali">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isBengali ? "স্টুডেন্ট আইডি (Student ID)" : "Student ID"}</span>
              </span>
              {activeTarget === "studentId" && (
                <span className="text-[10px] font-mono text-emerald-400 animate-pulse">
                  ● ACTIVE
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <input
                type="text"
                readOnly
                inputMode="none"
                value={studentId}
                placeholder={isBengali ? "আইডি লিখুন (উদাঃ 2302001)" : "Tap to type (e.g., 2302001)"}
                className="w-full bg-transparent text-slate-100 font-mono text-lg font-bold tracking-wider placeholder-slate-400 focus:outline-none cursor-pointer"
              />
              {studentId && activeTarget === "studentId" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                  className="text-slate-400 hover:text-slate-200 text-xs font-bengali px-1.5 py-0.5 rounded bg-slate-800"
                >
                  {isBengali ? "মুছুন" : "Clear"}
                </button>
              )}
            </div>
          </div>

          {/* Field 2: 4-Digit Secret PIN Display (4 Masked Bullet Boxes) */}
          <div
            onClick={() => {
              triggerKeyHaptics();
              setActiveTarget("pin");
            }}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              activeTarget === "pin"
                ? "bg-slate-950 border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-glow"
                : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="flex items-center space-x-1.5 text-slate-300 font-bengali">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>{isBengali ? "গোপন ডাইনিং পিন (Secret PIN)" : "4-Digit Dining PIN"}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {pin.length} / 4
              </span>
            </div>

            {/* 4 Discrete Circular Masked Boxes */}
            <div className="flex items-center justify-center space-x-3 sm:space-x-4 py-1">
              {[0, 1, 2, 3].map((index) => {
                const isFilled = index < pin.length;
                const isCurrent = index === pin.length && activeTarget === "pin";

                return (
                  <div
                    key={index}
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border-2 flex items-center justify-center transition-all ${
                      isFilled
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-emerald-glow"
                        : isCurrent
                        ? "bg-slate-900 border-amber-400 ring-2 ring-amber-400/30"
                        : "bg-slate-900/80 border-slate-800 text-slate-600"
                    }`}
                  >
                    {isFilled ? (
                      <span className="text-3xl leading-none text-emerald-400 font-black">
                        •
                      </span>
                    ) : isCurrent ? (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error Alert Display */}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center space-x-2 font-bengali"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{isBengali ? errorMessage.bn : errorMessage.en}</span>
          </motion.div>
        )}

        {/* Dedicated On-Screen ATM Touch Keypad */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-3 gap-2">
            {/* Rows 1-3: Digits 1 to 9 */}
            {[
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
            ].map((row, rIdx) => (
              <React.Fragment key={rIdx}>
                {row.map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleDigitPress(digit)}
                    className="min-h-[58px] sm:min-h-[64px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-white font-mono text-2xl font-bold transition-all active:scale-95 shadow-md flex items-center justify-center border border-slate-700/60"
                  >
                    {isBengali ? toBengaliDigits(digit) : digit}
                  </button>
                ))}
              </React.Fragment>
            ))}

            {/* Bottom Row: Clear / Backspace ⌫, Digit 0, and Submit ✓ */}
            {/* Key: Backspace */}
            <button
              type="button"
              onClick={handleBackspace}
              className="min-h-[58px] sm:min-h-[64px] rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-rose-600 text-slate-300 hover:text-white font-mono text-lg font-bold transition-all active:scale-95 shadow-md flex items-center justify-center border border-slate-700/60"
              title="Backspace"
            >
              <Delete className="w-6 h-6" />
            </button>

            {/* Key: 0 */}
            <button
              type="button"
              onClick={() => handleDigitPress("0")}
              className="min-h-[58px] sm:min-h-[64px] rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-white font-mono text-2xl font-bold transition-all active:scale-95 shadow-md flex items-center justify-center border border-slate-700/60"
            >
              {isBengali ? "০" : "0"}
            </button>

            {/* Key: Submit Action */}
            <button
              type="button"
              disabled={!isFormValid || isSubmitting}
              onClick={handleSubmit}
              className={`min-h-[58px] sm:min-h-[64px] rounded-2xl font-bold text-xl transition-all active:scale-95 shadow-lg flex items-center justify-center border ${
                isFormValid && !isSubmitting
                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-emerald-glow"
                  : "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60"
              }`}
              title="Verify PIN"
            >
              {isSubmitting ? (
                <RefreshCw className="w-6 h-6 animate-spin text-slate-950" />
              ) : (
                <Check className="w-7 h-7 text-slate-950 stroke-[3]" />
              )}
            </button>
          </div>
        </div>

        {/* Footer Dismiss Button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold font-bengali transition-colors flex items-center justify-center space-x-1.5"
          >
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            <span>{isBengali ? "বাতিল করুন ও ক্যামেরায় ফিরুন" : "Cancel & Return to Camera"}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default DeadBatteryModal;
