"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  Utensils,
  Coffee,
  Sun,
  Moon,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ArrowLeft,
  Filter,
  Layers,
  Sparkles,
  Download,
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { toBengaliDigits, cn } from "@/lib/utils";
import { MealType } from "@/types";

interface MealHistoryRecord {
  id: string;
  date: string;
  meal_type: MealType;
  status: "consumed" | "booked" | "cancelled";
  claimed_at: string | null;
  created_at?: string;
}

interface MonthlyStats {
  totalMeals: number;
  consumedCount: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
}

const MONTH_OPTIONS = [
  { value: "2026-10", labelEn: "October 2026", labelBn: "অক্টোবর ২০২৬" },
  { value: "2026-09", labelEn: "September 2026", labelBn: "সেপ্টেম্বর ২০২৬" },
  { value: "2026-08", labelEn: "August 2026", labelBn: "আগস্ট ২০২৬" },
  { value: "2026-07", labelEn: "July 2026", labelBn: "জুলাই ২০২৬" },
  { value: "2026-06", labelEn: "June 2026", labelBn: "জুন ২০২৬" },
  { value: "2026-05", labelEn: "May 2026", labelBn: "মে ২০২৬" },
];

export default function StudentMealHistoryPage() {
  const { isBengali } = useTranslation();

  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [filterShift, setFilterShift] = useState<"all" | MealType>("all");
  const [meals, setMeals] = useState<MealHistoryRecord[]>([]);
  const [stats, setStats] = useState<MonthlyStats>({
    totalMeals: 0,
    consumedCount: 0,
    breakfastCount: 0,
    lunchCount: 0,
    dinnerCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async (month: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/student/meal-history?month=${month}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setMeals(data.meals || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load meal history:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(selectedMonth);
  }, [fetchHistory, selectedMonth]);

  // Filtered meal list
  const filteredMeals = useMemo(() => {
    if (filterShift === "all") return meals;
    return meals.filter((m) => m.meal_type === filterShift);
  }, [meals, filterShift]);

  // Format BST consumption timestamp
  const formatTime = (isoString?: string | null) => {
    if (!isoString) return isBengali ? "সময় অপ্রাপ্য" : "Time not recorded";
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(date);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background Institutional Glow */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <Link
            href="/student/dashboard"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center border border-slate-700"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 font-bengali">
                {isBengali ? "মাসিক মিল হিস্ট্রি ও রিপোর্ট" : "Monthly Meal History"}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                OFFICIAL
              </span>
            </div>
            <p className="text-xs text-slate-400 font-bengali">
              {isBengali ? "আপনার গৃহীত সকল মিলের বিস্তারিত হিসাব" : "Record of all claimed meals"}
            </p>
          </div>
        </div>

        <LanguageToggle />
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6 z-10">
        {/* Month Selector & Filter Controls Bar */}
        <div className="rounded-3xl p-4 sm:p-5 bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Month Selector */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-400 font-bengali block">
                {isBengali ? "মাস নির্বাচন করুন" : "Select Month"}
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
              >
                {MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
                    {isBengali ? opt.labelBn : opt.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Shift Filter Pills */}
          <div className="flex items-center space-x-1.5 p-1 rounded-2xl bg-slate-950/70 border border-slate-800/90 self-start sm:self-auto">
            {(["all", "breakfast", "lunch", "dinner"] as const).map((shift) => {
              const isSel = filterShift === shift;
              return (
                <button
                  key={shift}
                  type="button"
                  onClick={() => setFilterShift(shift)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all",
                    isSel
                      ? "bg-emerald-500 text-slate-950 font-bold shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {shift === "all"
                    ? isBengali
                      ? "সকল"
                      : "All"
                    : shift === "breakfast"
                    ? isBengali
                      ? "সকাল"
                      : "Breakfast"
                    : shift === "lunch"
                    ? isBengali
                      ? "দুপুর"
                      : "Lunch"
                    : isBengali
                    ? "রাত"
                    : "Dinner"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Aggregate Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Meals */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-bengali">
                {isBengali ? "মোট মিল" : "Total Meals"}
              </span>
              <p className="text-2xl font-extrabold text-emerald-400 font-mono">
                {isBengali ? toBengaliDigits(stats.totalMeals) : stats.totalMeals}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Utensils className="w-5 h-5" />
            </div>
          </div>

          {/* Breakfast */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-bengali">
                {isBengali ? "সকালের নাস্তা" : "Breakfast"}
              </span>
              <p className="text-2xl font-extrabold text-amber-400 font-mono">
                {isBengali ? toBengaliDigits(stats.breakfastCount) : stats.breakfastCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
          </div>

          {/* Lunch */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-bengali">
                {isBengali ? "দুপুরের খাবার" : "Lunch"}
              </span>
              <p className="text-2xl font-extrabold text-emerald-400 font-mono">
                {isBengali ? toBengaliDigits(stats.lunchCount) : stats.lunchCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sun className="w-5 h-5" />
            </div>
          </div>

          {/* Dinner */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 font-bengali">
                {isBengali ? "রাতের খাবার" : "Dinner"}
              </span>
              <p className="text-2xl font-extrabold text-indigo-400 font-mono">
                {isBengali ? toBengaliDigits(stats.dinnerCount) : stats.dinnerCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Moon className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Meal History Table */}
        <div className="rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-100 font-bengali">
                {isBengali ? "মিলের তালিকা ও গ্রহণের সময়" : "Consumption Ledger"}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {filteredMeals.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4 font-bengali">{isBengali ? "তারিখ" : "Date"}</th>
                  <th className="py-3.5 px-4 font-bengali">{isBengali ? "মিলের ধরন" : "Meal Shift"}</th>
                  <th className="py-3.5 px-4 font-bengali">{isBengali ? "অবস্থা" : "Status"}</th>
                  <th className="py-3.5 px-4 font-bengali">{isBengali ? "গ্রহণের সঠিক সময় (BST)" : "Claimed Timestamp (BST)"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs text-slate-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center space-x-2">
                        <RotateCw className="w-5 h-5 animate-spin text-emerald-400" />
                        <span className="font-bengali">{isBengali ? "হিস্ট্রি লোড হচ্ছে..." : "Loading history..."}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredMeals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 font-bengali">
                      {isBengali
                        ? "এই মাসে কোনো মিল রেকর্ড পাওয়া যায়নি。"
                        : "No meal records found for this period."}
                    </td>
                  </tr>
                ) : (
                  filteredMeals.map((meal) => {
                    const isConsumed = meal.status === "consumed";

                    return (
                      <tr key={meal.id} className="transition-colors hover:bg-slate-800/30">
                        {/* Date */}
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                          {isBengali ? toBengaliDigits(meal.date) : meal.date}
                        </td>

                        {/* Shift Badge */}
                        <td className="py-3.5 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border",
                              meal.meal_type === "breakfast" &&
                                "bg-amber-500/10 border-amber-500/30 text-amber-300",
                              meal.meal_type === "lunch" &&
                                "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
                              meal.meal_type === "dinner" &&
                                "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                            )}
                          >
                            {meal.meal_type === "breakfast" && <Coffee className="w-3.5 h-3.5" />}
                            {meal.meal_type === "lunch" && <Sun className="w-3.5 h-3.5" />}
                            {meal.meal_type === "dinner" && <Moon className="w-3.5 h-3.5" />}
                            <span className="capitalize font-bengali">
                              {meal.meal_type === "breakfast"
                                ? isBengali
                                  ? "সকাল (Breakfast)"
                                  : "Breakfast"
                                : meal.meal_type === "lunch"
                                ? isBengali
                                  ? "দুপুর (Lunch)"
                                  : "Lunch"
                                : isBengali
                                ? "রাত (Dinner)"
                                : "Dinner"}
                            </span>
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {isConsumed ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bengali">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>{isBengali ? "গৃহীত (Consumed)" : "Consumed"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 font-bengali">
                              <span>{isBengali ? "বুকড (Booked)" : "Booked"}</span>
                            </span>
                          )}
                        </td>

                        {/* Claimed Time */}
                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          {meal.claimed_at ? (
                            <div className="flex items-center space-x-1.5 text-xs">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              <span>{formatTime(meal.claimed_at)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
