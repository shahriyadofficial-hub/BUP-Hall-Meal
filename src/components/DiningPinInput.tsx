"use client";

import React, { useState, useRef, useEffect } from "react";
import { Lock, Info, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/context/LocaleContext";

interface DiningPinInputProps {
  onPinValidated: (pin: string | null) => void;
  disabled?: boolean;
}

export const DiningPinInput: React.FC<DiningPinInputProps> = ({
  onPinValidated,
  disabled = false,
}) => {
  const { t, isBengali } = useTranslation();

  // Primary PIN boxes (4 digits)
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  // Confirmation PIN boxes (4 digits)
  const [confirmPin, setConfirmPin] = useState<string[]>(["", "", "", ""]);

  // Show/Mask toggle
  const [showPin, setShowPin] = useState(false);
  const [showTooltip, setShowTooltip] = useState(true);

  // Input refs for auto-advance
  const pinRefs = [
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
  ];

  const confirmRefs = [
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
  ];

  const primaryPinString = pin.join("");
  const confirmPinString = confirmPin.join("");

  const isPrimaryComplete = primaryPinString.length === 4;
  const isConfirmComplete = confirmPinString.length === 4;
  // Only show mismatch once both primary and confirm PIN fields have all 4 digits entered
  const isMismatch = isPrimaryComplete && isConfirmComplete && primaryPinString !== confirmPinString;
  const isMatch = isPrimaryComplete && isConfirmComplete && primaryPinString === confirmPinString;

  const prevPrimaryComplete = useRef(false);

  useEffect(() => {
    if (isMatch) {
      onPinValidated(primaryPinString);
    } else {
      onPinValidated(null);
    }
  }, [isMatch, primaryPinString, onPinValidated]);

  // Smooth auto-focus to first confirmation box when 4th primary digit is entered
  useEffect(() => {
    if (!prevPrimaryComplete.current && isPrimaryComplete) {
      setTimeout(() => {
        confirmRefs[0]?.current?.focus();
      }, 50);
    }
    prevPrimaryComplete.current = isPrimaryComplete;
  }, [isPrimaryComplete]);

  /**
   * Handles digit input and auto-advance
   */
  const handleDigitChange = (
    index: number,
    value: string,
    isConfirm: boolean
  ) => {
    // Only accept numeric digits
    const cleaned = value.replace(/\D/g, "");
    const targetState = isConfirm ? [...confirmPin] : [...pin];
    const targetSet = isConfirm ? setConfirmPin : setPin;
    const targetRefs = isConfirm ? confirmRefs : pinRefs;

    if (!cleaned) {
      targetState[index] = "";
      targetSet(targetState);
      return;
    }

    // Typing a new digit into an already populated box: pick the newest digit
    if (cleaned.length > 1) {
      targetState[index] = cleaned.slice(-1);
      targetSet(targetState);
      if (index < 3) {
        targetRefs[index + 1]?.current?.focus();
      }
      return;
    }

    // Single digit input
    targetState[index] = cleaned[0];
    targetSet(targetState);

    // Auto-advance to next box
    if (index < 3) {
      targetRefs[index + 1]?.current?.focus();
    }
  };

  /**
   * Handles backspace navigation
   */
  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    isConfirm: boolean
  ) => {
    const targetState = isConfirm ? confirmPin : pin;
    const targetRefs = isConfirm ? confirmRefs : pinRefs;

    if (e.key === "Backspace") {
      if (!targetState[index] && index > 0) {
        targetRefs[index - 1]?.current?.focus();
      }
    }
  };

  /**
   * Handles paste event directly
   */
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    isConfirm: boolean
  ) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!pasted) return;

    const digits = pasted.split("");
    const newPin = ["", "", "", ""];
    digits.forEach((d, i) => {
      newPin[i] = d;
    });

    if (isConfirm) {
      setConfirmPin(newPin);
      confirmRefs[Math.min(digits.length, 3)]?.current?.focus();
    } else {
      setPin(newPin);
      if (digits.length === 4) {
        confirmRefs[0]?.current?.focus();
      } else {
        pinRefs[digits.length]?.current?.focus();
      }
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Header and Mask Toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5 font-bengali">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>{t.auth.pinSetupTitle}</span>
          <span className="text-emerald-400">*</span>
        </label>
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors flex items-center space-x-1"
        >
          {showPin ? (
            <>
              <EyeOff className="w-3 h-3" />
              <span>{isBengali ? "পিন লুকান" : "Mask PIN"}</span>
            </>
          ) : (
            <>
              <Eye className="w-3 h-3" />
              <span>{isBengali ? "পিন দেখুন" : "Reveal"}</span>
            </>
          )}
        </button>
      </div>

      {/* Educational Tooltip Banner matching requirements strictly */}
      <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/25 flex items-start space-x-2.5">
        <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-emerald-200/90 leading-relaxed font-bengali">
          {t.auth.pinTooltip}
        </p>
      </div>

      {/* Dual PIN Inputs: Step 1: Set PIN, Step 2: Confirm PIN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Step 1: 4-Box PIN Input */}
        <div className="space-y-1.5">
          <span className="text-[11px] text-slate-400 font-bengali">
            {t.auth.pinPrompt}
          </span>
          <div className="flex items-center space-x-2">
            {pin.map((digit, idx) => (
              <div key={`pin-${idx}`} className="relative flex-1">
                <input
                  ref={pinRefs[idx]}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  disabled={disabled}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value, false)}
                  onKeyDown={(e) => handleKeyDown(idx, e, false)}
                  onPaste={(e) => handlePaste(e, false)}
                  className={`w-full h-12 text-center text-lg font-mono font-bold rounded-xl bg-slate-950 border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    digit
                      ? "border-emerald-500/80 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : "border-slate-800 text-slate-200"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Step 2: Confirm 4-Box PIN Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-bengali">
              {t.auth.confirmPinPrompt}
            </span>
            {isMatch && (
              <span className="text-[10px] text-emerald-400 flex items-center space-x-0.5 font-mono">
                <ShieldCheck className="w-3 h-3" />
                <span>Verified</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {confirmPin.map((digit, idx) => (
              <div key={`confirm-${idx}`} className="relative flex-1">
                <input
                  ref={confirmRefs[idx]}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  disabled={disabled || !isPrimaryComplete}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value, true)}
                  onKeyDown={(e) => handleKeyDown(idx, e, true)}
                  onPaste={(e) => handlePaste(e, true)}
                  className={`w-full h-12 text-center text-lg font-mono font-bold rounded-xl bg-slate-950 border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    isMismatch
                      ? "border-rose-500/80 text-rose-400 focus:ring-rose-500"
                      : digit
                      ? "border-emerald-500/80 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : "border-slate-800 text-slate-200"
                  } ${!isPrimaryComplete ? "opacity-50 cursor-not-allowed" : ""}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Realtime Status Feedback */}
      <AnimatePresence>
        {isMismatch && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-[11px] text-rose-400 font-bengali"
          >
            • {t.auth.pinMismatch}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DiningPinInput;
