"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Building2, 
  Clock, 
  ShieldCheck, 
  QrCode, 
  Utensils, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  Smartphone,
  ScanLine,
  KeyRound,
  LogIn
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { getDailyBookingCutoffStatus, BookingCutoffStatus } from "@/lib/utils";
import { HallType, MealType } from "@/types";

/**
 * BUP Hall Dining & Meal Management System - Foundational Shell View
 * 
 * Demonstrates:
 * 1. Dual-Interface Philosophy:
 *    - Student View (refined institutional obsidian palette #0b0f17, frosted glass cards, subtle emerald accents)
 *    - Staff Kiosk View (high-contrast, one-handed mobile camera perspective)
 * 2. Instant Bilingual Translation Engine (defaulting to Bengali 'bn' with seamless toggle to 'en')
 * 3. BUP Male Hall and BUP Female Hall institutional designations
 * 4. Cutoff Engine: 10:00 PM visible institutional rule vs 10:10 PM backend grace countdown
 */
export default function HomePage() {
  const { t, isBengali } = useTranslation();
  
  // Selected Hall: BUP Male Hall or BUP Female Hall
  const [selectedHall, setSelectedHall] = useState<HallType>("male");
  
  // Active UI Mode: Student View vs Staff Kiosk View
  const [activeMode, setActiveMode] = useState<"student" | "staff">("student");

  // Cutoff Countdown State
  const [cutoffStatus, setCutoffStatus] = useState<BookingCutoffStatus>(() =>
    getDailyBookingCutoffStatus(new Date(), isBengali)
  );

  // Sample meal selection state for demonstration
  const [bookedMeals, setBookedMeals] = useState<Record<MealType, boolean>>({
    breakfast: true,
    lunch: true,
    dinner: false,
  });

  // Update countdown every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCutoffStatus(getDailyBookingCutoffStatus(new Date(), isBengali));
    }, 1000);
    return () => clearInterval(timer);
  }, [isBengali]);

  const toggleMeal = (meal: MealType) => {
    if (!cutoffStatus.isBookingOpen) return;
    setBookedMeals((prev) => ({ ...prev, [meal]: !prev[meal] }));
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-slate-100 flex flex-col items-center px-4 py-6 sm:py-10">
      {/* Top Institutional Header Container */}
      <header className="w-full max-w-md mx-auto flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-emerald-glow">
              <Utensils className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <h1 className="text-xs tracking-wider uppercase font-semibold text-emerald-400">
                {t.common.bupTitle}
              </h1>
              <p className="text-sm font-bold text-slate-100 font-bengali">
                {t.common.appName}
              </p>
            </div>
          </div>

          {/* Bilingual Language Switcher Component */}
          <LanguageToggle />
        </div>

        {/* Quick Portal Access Banner to Student Auth & Onboarding */}
        <Link
          href="/auth/login"
          className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/30 hover:bg-emerald-950/50 border border-emerald-500/30 transition-all text-xs font-medium group"
        >
          <div className="flex items-center space-x-2">
            <LogIn className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            <span className="font-bengali text-emerald-300 font-semibold">
              {isBengali ? "শিক্ষার্থী লগইন ও প্রোফাইল অনবোর্ডিং" : "Student Login & Profile Onboarding"}
            </span>
          </div>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
            Email / Phone
          </span>
        </Link>

        {/* Quick Portal Switcher Grid */}
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/student/dashboard"
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-center transition-all group"
          >
            <div className="text-[11px] font-bold text-slate-200 group-hover:text-emerald-400 font-bengali">
              ড্যাশবোর্ড
            </div>
            <div className="text-[9px] text-slate-400 font-mono">Student</div>
          </Link>
          <Link
            href="/staff/scanner"
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-center transition-all group"
          >
            <div className="text-[11px] font-bold text-slate-200 group-hover:text-emerald-400 font-bengali">
              স্ক্যানার
            </div>
            <div className="text-[9px] text-slate-400 font-mono">Staff Kiosk</div>
          </Link>
          <Link
            href="/manager/kitchen"
            className="p-2 rounded-xl bg-amber-950/40 hover:bg-amber-950/70 border border-amber-500/40 text-center transition-all group shadow-sm"
          >
            <div className="text-[11px] font-bold text-amber-300 group-hover:text-amber-200 font-bengali">
              কিচেন স্লিপ
            </div>
            <div className="text-[9px] text-amber-400/80 font-mono">Manager</div>
          </Link>
        </div>

        {/* Hall Selection Switch (BUP Male Hall / BUP Female Hall) */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-900/80 border border-slate-800">
          <button
            type="button"
            onClick={() => setSelectedHall("male")}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${
              selectedHall === "male"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span className="font-bengali">{t.common.maleHall}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedHall("female")}
            className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${
              selectedHall === "female"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/50"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span className="font-bengali">{t.common.femaleHall}</span>
          </button>
        </div>

        {/* Dual Interface Preview Mode Switcher (Student vs Staff) */}
        <div className="flex items-center justify-center space-x-3 text-xs bg-slate-900/50 p-1.5 rounded-lg border border-slate-800/60">
          <span className="text-slate-400 text-[11px]">ইন্টারফেস প্রিভিউ:</span>
          <button
            type="button"
            onClick={() => setActiveMode("student")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeMode === "student"
                ? "bg-slate-800 text-emerald-400 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            শিক্ষার্থী ভিউ
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("staff")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeMode === "staff"
                ? "bg-slate-800 text-amber-400 border border-amber-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            কাউন্টার স্টাফ ভিউ
          </button>
        </div>
      </header>

      {/* Main Dynamic View Content */}
      <main className="w-full max-w-md mx-auto space-y-4">
        <AnimatePresence mode="wait">
          {activeMode === "student" ? (
            /* ========================================================
             * 1. Student Interface: Refined Institutional Dark Palette
             * ======================================================== */
            <motion.div
              key="student-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Visible Cutoff & Grace Countdown Card */}
              <div className="glass-card p-4 border-l-4 border-l-amber-500">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-400 animate-pulse-subtle" />
                    <span className="text-xs font-semibold text-amber-400 font-bengali">
                      {t.bookingRules.cutoffRemaining}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-bold text-amber-300 tracking-wider">
                    {cutoffStatus.formattedRemaining}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-300 font-bengali leading-relaxed">
                  <p className="font-medium text-slate-200">
                    • {t.bookingRules.visibleCutoffNotice}
                  </p>
                  <p className="text-slate-400 mt-0.5 text-[10px]">
                    ({t.bookingRules.actualGraceCutoffNotice})
                  </p>
                </div>
              </div>

              {/* Dynamic QR Anti-Proxy Pass Preview */}
              <div className="glass-card p-5 text-center relative overflow-hidden">
                <div className="absolute top-2 right-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3 mr-1" />
                    TOTP Active
                  </span>
                </div>

                <h2 className="text-sm font-bold text-slate-100 font-bengali">
                  {t.qrPass.title}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5 font-bengali">
                  {t.qrPass.subtitle}
                </p>

                {/* Simulated Dynamic QR Box with Scanner Line */}
                <div className="mt-4 mx-auto w-44 h-44 rounded-2xl bg-white p-3 shadow-emerald-glow flex flex-col items-center justify-center relative">
                  <QrCode className="w-36 h-36 text-slate-900" />
                  <div className="absolute inset-x-3 h-0.5 bg-emerald-500/80 shadow-[0_0_8px_#10b981] animate-qr-scan" />
                </div>

                <div className="mt-3 flex items-center justify-center space-x-1.5 text-xs text-slate-400 font-bengali">
                  <span>{t.qrPass.tokenRefreshingIn}</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {isBengali ? "২৮" : "28"} {t.qrPass.seconds}
                  </span>
                </div>

                <p className="mt-2 text-[11px] text-slate-400/90 font-bengali px-2">
                  {t.qrPass.screenshotWarning}
                </p>
              </div>

              {/* Meal Shifts Booking Card */}
              <div className="glass-card p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-bengali">
                    {t.nav.mealBooking} (আগামীকাল)
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-bengali">
                    {t.bookingRules.windowOpen}
                  </span>
                </div>

                {/* Shifts List */}
                <div className="space-y-2.5">
                  {/* Breakfast */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div>
                      <p className="text-xs font-semibold text-slate-100 font-bengali">
                        {t.shifts.breakfast}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {t.shifts.breakfastTime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMeal("breakfast")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        bookedMeals.breakfast
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {bookedMeals.breakfast ? t.shifts.booked : t.shifts.notBooked}
                    </button>
                  </div>

                  {/* Lunch */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div>
                      <p className="text-xs font-semibold text-slate-100 font-bengali">
                        {t.shifts.lunch}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {t.shifts.lunchTime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMeal("lunch")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        bookedMeals.lunch
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {bookedMeals.lunch ? t.shifts.booked : t.shifts.notBooked}
                    </button>
                  </div>

                  {/* Dinner */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                    <div>
                      <p className="text-xs font-semibold text-slate-100 font-bengali">
                        {t.shifts.dinner}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {t.shifts.dinnerTime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMeal("dinner")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        bookedMeals.dinner
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {bookedMeals.dinner ? t.shifts.booked : t.shifts.notBooked}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ========================================================
             * 2. Staff Interface: Ultra-Simple, High-Contrast Kiosk View
             * ======================================================== */
            <motion.div
              key="staff-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="kiosk-card p-5 border-emerald-500/40">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <ScanLine className="w-5 h-5 text-emerald-400 animate-pulse" />
                    <h2 className="text-sm font-bold text-slate-100 font-bengali">
                      {t.counter.title}
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Ready
                  </span>
                </div>

                {/* Simulated High-Contrast Camera Viewfinder */}
                <div className="mt-4 w-full h-52 rounded-xl bg-slate-950 border-2 border-dashed border-emerald-500/50 flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                    <Smartphone className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200 font-bengali">
                    {t.counter.viewfinderInstruction}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t.counter.scanning}
                  </p>
                </div>

                {/* Manual 4-Digit Dining PIN Fallback Prompt */}
                <div className="mt-4 p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="flex items-center space-x-2 mb-2">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-300 font-bengali">
                      {t.counter.manualPinTab} (চার্জ শেষ হলে)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder={t.counter.enterStudentId}
                      className="px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <input
                      type="password"
                      maxLength={4}
                      placeholder={t.counter.enterPin}
                      className="px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-center"
                    />
                  </div>
                </div>

                {/* Counter Photo Verification & Anti-Proxy Compliance Alert */}
                <div className="mt-3 flex items-start space-x-2 text-[11px] text-slate-400 font-bengali p-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p>{t.counter.photoMatchWarning}</p>
                </div>

                {/* Confirm Entry Button */}
                <button
                  type="button"
                  className="mt-4 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-emerald-glow flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span className="font-bengali">{t.counter.confirmEntry}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer System Status */}
      <footer className="w-full max-w-md mx-auto mt-8 pt-4 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center space-x-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bengali">{t.common.onlineMode}</span>
        </div>
        <span className="font-mono text-slate-400">PWA v1.0.0 (BST UTC+6)</span>
      </footer>
    </div>
  );
}
