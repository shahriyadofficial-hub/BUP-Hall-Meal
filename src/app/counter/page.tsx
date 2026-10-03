"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  QrCode,
  Hash,
  Utensils,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Coffee,
  Sun,
  Moon,
  Camera,
  CameraOff,
  User,
  ShieldCheck,
  RotateCw,
  Sparkles,
  Volume2,
  VolumeX,
  Keyboard,
  ArrowRight,
  X,
  Clock,
  Building2,
  DoorClosed,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { playFeedback } from "@/lib/audio-feedback";
import { formatHallSerial } from "@/lib/hall-serial";
import { MealType } from "@/types";
import { cn } from "@/lib/utils";

interface StudentLookupResult {
  id: string;
  student_id: string;
  full_name: string;
  avatar_url: string | null;
  profile_photo_url: string | null;
  department: string;
  room_number: string;
  hall: "male" | "female";
  hall_serial: string;
  meal_status: "booked" | "already_consumed" | "not_booked";
  is_booked: boolean;
  consumed_at: string | null;
  booking_date: string;
  meal_type: MealType;
}

export default function CounterTerminalPage() {
  // Active shift selection (auto-detects based on BST hour)
  const [activeShift, setActiveShift] = useState<MealType>(() => {
    const hour = new Date().getUTCHours() + 6; // Approx BST
    if (hour >= 6 && hour < 11) return "breakfast";
    if (hour >= 11 && hour < 16) return "lunch";
    return "dinner";
  });

  // Mode: Serial Keypad vs QR Scanner
  const [activeTab, setActiveTab] = useState<"serial" | "scanner">("serial");

  // Serial input state
  const [serialInput, setSerialInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Student verification modal state
  const [selectedStudent, setSelectedStudent] = useState<StudentLookupResult | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimSuccessMessage, setClaimSuccessMessage] = useState<string | null>(null);

  // Sound feedback toggle
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);

  // Stats for today's shift counter
  const [sessionCount, setSessionCount] = useState(0);

  // Today's Recent Distribution Log Feed
  interface RecentClaim {
    id: string;
    serial: string;
    name: string;
    studentId: string;
    room: string;
    time: string;
    shift: MealType;
  }
  const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([]);

  // References
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const isThrottledRef = useRef<boolean>(false);

  // Auto-focus input when serial tab is active or modal closes
  const focusInput = useCallback(() => {
    if (activeTab === "serial" && !selectedStudent) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [activeTab, selectedStudent]);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  // Lookup student handler
  const handleLookup = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;

      setIsSearching(true);
      setSearchError(null);

      try {
        const res = await fetch(
          `/api/counter/lookup?query=${encodeURIComponent(trimmed)}&meal_type=${activeShift}`
        );
        const data = await res.json();

        if (!res.ok || !data.success) {
          if (isSoundEnabled) playFeedback("error");
          setSearchError(data.message || data.error || "Student not found");
          return;
        }

        const student = data.student as StudentLookupResult;
        setSelectedStudent(student);

        if (student.meal_status === "already_consumed") {
          if (isSoundEnabled) playFeedback("warning");
        } else if (student.meal_status === "booked") {
          if (isSoundEnabled) playFeedback("click");
        } else {
          if (isSoundEnabled) playFeedback("reject");
        }
      } catch {
        if (isSoundEnabled) playFeedback("error");
        setSearchError("Network error. Please try again.");
      } finally {
        setIsSearching(false);
      }
    },
    [activeShift, isSoundEnabled]
  );

  // Confirm Meal Claim handler
  const handleConfirmClaim = useCallback(async () => {
    if (!selectedStudent || isClaiming) return;

    if (selectedStudent.meal_status === "already_consumed") {
      if (isSoundEnabled) playFeedback("error");
      return;
    }

    setIsClaiming(true);
    try {
      const res = await fetch("/api/counter/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "pin",
          user_id: selectedStudent.id,
          student_id: selectedStudent.student_id,
          meal_type: activeShift,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (isSoundEnabled) playFeedback("error");
        setSearchError(data.error || "Claim verification failed");
        return;
      }

      if (isSoundEnabled) playFeedback("success");
      setSessionCount((prev) => prev + 1);

      // Append to today's distribution log
      const timeStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(new Date());

      setRecentClaims((prev) => [
        {
          id: String(Date.now()),
          serial: selectedStudent.hall_serial,
          name: selectedStudent.full_name,
          studentId: selectedStudent.student_id,
          room: selectedStudent.room_number,
          time: timeStr,
          shift: activeShift,
        },
        ...prev.slice(0, 19),
      ]);

      // Flash success message
      setClaimSuccessMessage(
        `Meal Recorded for #${selectedStudent.hall_serial} (${selectedStudent.full_name})`
      );

      // Clear input and modal immediately for next student
      setSelectedStudent(null);
      setSerialInput("");
      focusInput();

      setTimeout(() => {
        setClaimSuccessMessage(null);
      }, 3500);
    } catch {
      if (isSoundEnabled) playFeedback("error");
      setSearchError("Connection issue while recording meal claim");
    } finally {
      setIsClaiming(false);
    }
  }, [selectedStudent, isClaiming, activeShift, isSoundEnabled, focusInput]);

  // Global Keyboard listener: Enter to lookup, Space to claim, Esc to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Spacebar shortcut to confirm claim
      if (e.code === "Space" && selectedStudent && !isClaiming) {
        // Prevent page scroll
        e.preventDefault();
        handleConfirmClaim();
        return;
      }

      // Escape to dismiss modal
      if (e.key === "Escape" && selectedStudent) {
        e.preventDefault();
        setSelectedStudent(null);
        focusInput();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedStudent, isClaiming, handleConfirmClaim, focusInput]);

  // Serial Form Submit
  const handleSerialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (serialInput.trim()) {
      handleLookup(serialInput);
    }
  };

  // Quick Keypad Taps
  const handleKeypadPress = (val: string) => {
    if (val === "C") {
      setSerialInput("");
      focusInput();
    } else if (val === "DEL") {
      setSerialInput((prev) => prev.slice(0, -1));
      focusInput();
    } else if (val === "GO") {
      if (serialInput.trim()) {
        handleLookup(serialInput);
      }
    } else {
      if (serialInput.length < 5) {
        setSerialInput((prev) => prev + val);
      }
      focusInput();
    }
  };

  // Camera QR Scanner Lifecycle
  useEffect(() => {
    if (activeTab !== "scanner") {
      if (scannerRef.current && isScanningRef.current) {
        scannerRef.current
          .stop()
          .then(() => {
            scannerRef.current?.clear();
            isScanningRef.current = false;
          })
          .catch(() => {});
      }
      return;
    }

    const html5Qr = new Html5Qrcode("counter-qr-reader", {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false,
    });
    scannerRef.current = html5Qr;

    html5Qr
      .start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (isThrottledRef.current) return;
          isThrottledRef.current = true;
          handleLookup(decodedText);
          setTimeout(() => {
            isThrottledRef.current = false;
          }, 2000);
        },
        () => {
          // ignore scan frame misses
        }
      )
      .then(() => {
        isScanningRef.current = true;
      })
      .catch((err) => {
        console.warn("QR Scanner init failure:", err);
      });

    return () => {
      if (html5Qr && isScanningRef.current) {
        html5Qr
          .stop()
          .then(() => html5Qr.clear())
          .catch(() => {});
        isScanningRef.current = false;
      }
    };
  }, [activeTab, handleLookup]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Staff Navigation Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-emerald-glow text-slate-950">
            <Utensils className="w-5 h-5 font-bold" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-100 tracking-tight">
                BUP Dining Counter Terminal
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                HIGH SPEED
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Session Recorded: <span className="font-mono text-emerald-400 font-bold">{sessionCount} meals</span>
            </p>
          </div>
        </div>

        {/* Shift Selector & Controls */}
        <div className="flex items-center space-x-2">
          {/* Shift Picker */}
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-950/70 border border-slate-800">
            {(["breakfast", "lunch", "dinner"] as MealType[]).map((shift) => {
              const isSel = activeShift === shift;
              return (
                <button
                  key={shift}
                  type="button"
                  onClick={() => {
                    setActiveShift(shift);
                    if (isSoundEnabled) playFeedback("click");
                  }}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-all flex items-center space-x-1.5",
                    isSel
                      ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {shift === "breakfast" && <Coffee className="w-3.5 h-3.5" />}
                  {shift === "lunch" && <Sun className="w-3.5 h-3.5" />}
                  {shift === "dinner" && <Moon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{shift}</span>
                </button>
              );
            })}
          </div>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setIsSoundEnabled(!isSoundEnabled)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            title={isSoundEnabled ? "Mute sound" : "Enable sound"}
          >
            {isSoundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Terminal Workspace */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col items-center justify-center space-y-6">
        {/* Success Alert Toast */}
        <AnimatePresence>
          {claimSuccessMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="w-full max-w-md p-3.5 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 shadow-emerald-glow text-emerald-200 flex items-center space-x-3 text-sm font-semibold backdrop-blur-xl"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>{claimSuccessMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dual Mode Switcher Tabs */}
        <div className="w-full max-w-lg p-1.5 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 grid grid-cols-2 gap-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setActiveTab("serial");
              if (isSoundEnabled) playFeedback("click");
            }}
            className={cn(
              "py-3 rounded-xl text-sm font-bold flex items-center justify-center space-x-2 transition-all",
              activeTab === "serial"
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 shadow-md font-extrabold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            )}
          >
            <Hash className="w-4 h-4" />
            <span>Short Serial Keypad</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("scanner");
              if (isSoundEnabled) playFeedback("click");
            }}
            className={cn(
              "py-3 rounded-xl text-sm font-bold flex items-center justify-center space-x-2 transition-all",
              activeTab === "scanner"
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 shadow-md font-extrabold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            )}
          >
            <QrCode className="w-4 h-4" />
            <span>Camera QR Scanner</span>
          </button>
        </div>

        {/* TAB 1: SHORT SERIAL INPUT & FAST KEYPAD */}
        {activeTab === "serial" && (
          <div className="w-full max-w-lg space-y-4">
            {/* Large Serial Number Input Card */}
            <form onSubmit={handleSerialSubmit} className="relative">
              <div className="rounded-3xl p-5 bg-slate-900/80 backdrop-blur-2xl border border-slate-800 shadow-2xl space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
                  <span>Enter 1 to 3 Digit Hall Serial:</span>
                  <span className="font-mono text-emerald-400">e.g. 42 or 042</span>
                </div>

                <div className="relative flex items-center">
                  <span className="absolute left-5 text-3xl font-mono font-bold text-slate-500 select-none">
                    #
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                    value={serialInput}
                    onChange={(e) => setSerialInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="000"
                    maxLength={5}
                    className="w-full pl-12 pr-28 py-4 rounded-2xl bg-slate-950/80 border-2 border-emerald-500/40 focus:border-emerald-400 text-4xl font-mono font-extrabold text-emerald-300 placeholder:text-slate-700 tracking-wider shadow-inner outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!serialInput.trim() || isSearching}
                    className="absolute right-3 px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-sm shadow-emerald-glow transition-all flex items-center space-x-1.5"
                  >
                    {isSearching ? (
                      <RotateCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Find</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>

                {searchError && (
                  <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{searchError}</span>
                  </div>
                )}
              </div>
            </form>

            {/* Fast Touch Keypad for Counter Tablets / Touch Terminals */}
            <div className="rounded-3xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 shadow-lg grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "GO"].map((key) => {
                const isSpecial = key === "C" || key === "GO";
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeypadPress(key)}
                    className={cn(
                      "py-4 rounded-2xl text-xl font-mono font-bold transition-all active:scale-95 shadow-sm",
                      key === "GO"
                        ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-glow"
                        : key === "C"
                        ? "bg-slate-800 hover:bg-rose-500/20 text-rose-300 border border-slate-700/60"
                        : "bg-slate-800/70 hover:bg-slate-700/80 text-slate-100 border border-slate-700/50"
                    )}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CAMERA QR SCANNER */}
        {activeTab === "scanner" && (
          <div className="w-full max-w-lg space-y-4">
            <div className="rounded-3xl p-5 bg-slate-900/80 backdrop-blur-2xl border border-slate-800 shadow-2xl flex flex-col items-center space-y-4">
              <div className="flex items-center justify-between w-full text-xs text-slate-400 px-1">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>Camera Active: Auto-Scanning Student QR</span>
                </span>
                <span className="font-mono text-emerald-400 uppercase">{activeShift} Shift</span>
              </div>

              {/* QR Video Viewport */}
              <div className="relative w-full aspect-square max-w-xs rounded-2xl overflow-hidden bg-slate-950 border-2 border-emerald-500/50 shadow-inner flex items-center justify-center">
                <div id="counter-qr-reader" className="w-full h-full" />
                {/* Visual Reticle Corner Frame */}
                <div className="absolute inset-4 pointer-events-none border-2 border-dashed border-emerald-400/50 rounded-xl" />
              </div>

              {isSearching && (
                <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/30 animate-pulse">
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Looking up student dining profile...</span>
                </div>
              )}

              {searchError && (
                <div className="w-full p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TODAY'S LIVE DISTRIBUTION LOG */}
        {recentClaims.length > 0 && (
          <div className="w-full max-w-lg rounded-3xl p-5 bg-slate-900/80 backdrop-blur-2xl border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Today's Live Claim Log / আজকের বিতরণ লগ
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 font-bold">
                {recentClaims.length} served
              </span>
            </div>

            <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto pr-1">
              {recentClaims.map((claim) => (
                <div key={claim.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2.5">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-[11px]">
                      #{claim.serial}
                    </span>
                    <div className="truncate">
                      <p className="font-semibold text-slate-200 truncate">{claim.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        ID: {claim.studentId} • Room {claim.room}
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="text-[11px] font-mono text-slate-300 block">{claim.time}</span>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">
                      ✓ {claim.shift}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* VERIFICATION POPUP / MODAL */}
      <AnimatePresence>
        {selectedStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700/80 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-100">Student Identity Verification</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStudent(null);
                    focusInput();
                  }}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Student Details Body */}
              <div className="p-6 space-y-5 flex flex-col items-center text-center">
                {/* Large Student Photo */}
                <div className="relative w-28 h-28 rounded-3xl bg-slate-800 border-4 border-emerald-500/40 shadow-2xl overflow-hidden flex items-center justify-center">
                  {selectedStudent.avatar_url || selectedStudent.profile_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedStudent.avatar_url || selectedStudent.profile_photo_url || ""}
                      alt={selectedStudent.full_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-14 h-14 text-emerald-400" />
                  )}
                  <span className="absolute bottom-1 right-1 px-2 py-0.5 rounded-full bg-slate-950/90 text-emerald-400 font-mono font-bold text-[10px] border border-emerald-500/30">
                    #{selectedStudent.hall_serial}
                  </span>
                </div>

                {/* Identity Information */}
                <div className="space-y-1 w-full">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-xs">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hall Serial: #{selectedStudent.hall_serial}</span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-100 pt-1">
                    {selectedStudent.full_name}
                  </h2>

                  <div className="flex items-center justify-center space-x-3 text-xs text-slate-400 font-mono">
                    <span className="text-emerald-400 font-semibold">
                      ID: {selectedStudent.student_id}
                    </span>
                    <span>•</span>
                    <span>Room: {selectedStudent.room_number}</span>
                  </div>

                  <p className="text-xs text-slate-400 truncate pt-0.5">
                    {selectedStudent.department}
                  </p>
                </div>

                {/* Prominent Meal Status Badge */}
                <div className="w-full pt-1">
                  {selectedStudent.meal_status === "booked" && (
                    <div className="p-3.5 rounded-2xl bg-emerald-950/80 border-2 border-emerald-500 text-emerald-200 flex items-center justify-center space-x-2.5 shadow-emerald-glow">
                      <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-sm font-bold uppercase tracking-wider">
                        🟢 Booked — Ready to Claim
                      </span>
                    </div>
                  )}

                  {selectedStudent.meal_status === "already_consumed" && (
                    <div className="p-3.5 rounded-2xl bg-rose-950/80 border-2 border-rose-500 text-rose-200 flex flex-col items-center justify-center space-y-1 shadow-crimson-glow">
                      <div className="flex items-center space-x-2">
                        <XCircle className="w-5 h-5 text-rose-400" />
                        <span className="text-sm font-bold uppercase tracking-wider">
                          🔴 Already Consumed
                        </span>
                      </div>
                      <p className="text-xs font-mono text-rose-300/80">
                        Recorded at:{" "}
                        {selectedStudent.consumed_at
                          ? new Intl.DateTimeFormat("en-US", {
                              timeZone: "Asia/Dhaka",
                              hour: "numeric",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: true,
                            }).format(new Date(selectedStudent.consumed_at))
                          : "Earlier today"}
                      </p>
                    </div>
                  )}

                  {selectedStudent.meal_status === "not_booked" && (
                    <div className="p-3.5 rounded-2xl bg-slate-800/90 border border-slate-700 text-slate-300 flex items-center justify-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                      <span className="text-sm font-bold">
                        ⚪ Not Booked for this Window
                      </span>
                    </div>
                  )}
                </div>

                {/* Claim Confirmation Action */}
                <div className="w-full space-y-2 pt-2">
                  <button
                    type="button"
                    disabled={isClaiming || selectedStudent.meal_status === "already_consumed"}
                    onClick={handleConfirmClaim}
                    className={cn(
                      "w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center space-x-2 shadow-xl",
                      selectedStudent.meal_status === "already_consumed"
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                        : "bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 shadow-emerald-glow"
                    )}
                  >
                    {isClaiming ? (
                      <RotateCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5 font-bold" />
                        <span>Confirm Meal (Press Space)</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 pt-1">
                    <span>Press Spacebar to Confirm</span>
                    <span>Press Esc to Cancel</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
