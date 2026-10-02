"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Utensils,
  Calendar,
  Lock,
  Unlock,
  Printer,
  Download,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Building,
  ShieldCheck,
  Coffee,
  Sun,
  Moon,
  Users,
  FileSpreadsheet
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { cn, toBengaliDigits } from "@/lib/utils";

interface FloorData {
  floor: string;
  floorNumber: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  total: number;
}

interface StudentExport {
  student_id: string;
  full_name: string;
  hall: string;
  room_number: string;
  floor: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}

interface KitchenDashboardData {
  dates: {
    targetDate: string;
    todayStr: string;
    tomorrowStr: string;
    isTargetTomorrow: boolean;
    isTargetToday: boolean;
    bstTime: string;
  };
  cutoff: {
    isLocked: boolean;
    statusTextBn: string;
    statusTextEn: string;
  };
  cookSlip: {
    breakfast: number;
    lunch: number;
    dinner: number;
    totalMeals: number;
    diff: {
      breakfast: number;
      lunch: number;
      dinner: number;
    };
    baselineToday: {
      breakfast: number;
      lunch: number;
      dinner: number;
    };
  };
  floorBreakdown: FloorData[];
  studentList: StudentExport[];
  monthlyCounter: {
    monthNameEn: string;
    monthNameBn: string;
    breakfast: number;
    lunch: number;
    dinner: number;
    totalConsumed: number;
  };
}

export default function MessManagerKitchenPage() {
  const { t, locale, isBengali } = useTranslation();

  const [dashboardData, setDashboardData] = useState<KitchenDashboardData | null>(null);
  const [selectedDateMode, setSelectedDateMode] = useState<"tomorrow" | "today">("tomorrow");
  const [isLoading, setIsLoading] = useState(true);
  const [isFloorSectionOpen, setIsFloorSectionOpen] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [activeTab, setActiveTab] = useState<"slip" | "monthly">("slip");

  // Fetch kitchen aggregation data
  const fetchKitchenData = useCallback(async (dateMode: "tomorrow" | "today") => {
    setIsLoading(true);
    try {
      // 1. Initial request to get tomorrow & today dates
      const resInitial = await fetch("/api/manager/kitchen");
      const initialJson = await resInitial.json();

      let targetDate = initialJson.dates?.tomorrowStr;
      if (dateMode === "today") {
        targetDate = initialJson.dates?.todayStr;
      }

      // 2. Fetch for specific target date if needed
      if (dateMode === "today" && targetDate) {
        const resSpecific = await fetch(`/api/manager/kitchen?date=${targetDate}`);
        const specificJson = await resSpecific.json();
        setDashboardData(specificJson);
      } else {
        setDashboardData(initialJson);
      }
    } catch (err) {
      console.error("[Manager Kitchen] Error fetching data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKitchenData(selectedDateMode);
  }, [fetchKitchenData, selectedDateMode]);

  /**
   * Print Kitchen Slip Handler
   * Triggers browser print dialog optimized with @media print CSS
   */
  const handlePrintSlip = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  /**
   * CSV Export of Student Bookings for the day
   */
  const handleExportCSV = () => {
    if (!dashboardData || !dashboardData.studentList) return;

    const headers = ["Student ID", "Full Name", "Hall", "Room Number", "Floor", "Breakfast", "Lunch", "Dinner"];
    const rows = dashboardData.studentList.map((s) => [
      `"${s.student_id}"`,
      `"${s.full_name}"`,
      `"${s.hall}"`,
      `"${s.room_number}"`,
      `"${s.floor}"`,
      s.breakfast ? "YES" : "NO",
      s.lunch ? "YES" : "NO",
      s.dinner ? "YES" : "NO",
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `bup_dining_kitchen_slip_${dashboardData.dates.targetDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cookSlip = dashboardData?.cookSlip;
  const cutoff = dashboardData?.cutoff;
  const dates = dashboardData?.dates;
  const floors = dashboardData?.floorBreakdown || [];
  const monthly = dashboardData?.monthlyCounter;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* ================================================================== */}
      {/* 1. TOP NAVBAR & INSTITUTIONAL BRANDING (SCREEN ONLY)               */}
      {/* ================================================================== */}
      <nav className="print:hidden sticky top-0 z-30 w-full bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black shadow-md">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight font-bengali flex items-center space-x-1.5">
                <span>মেস ম্যানেজার কিচেন ড্যাশবোর্ড</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  MESS MANAGER
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 font-sans">
                BUP Hall Dining System • Cook&apos;s Preparation Slip &amp; Demand
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <LanguageToggle />
          <button
            type="button"
            onClick={() => fetchKitchenData(selectedDateMode)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin text-emerald-400")} />
          </button>
        </div>
      </nav>

      {/* ================================================================== */}
      {/* 2. MAIN KITCHEN DASHBOARD CONTAINER                                */}
      {/* ================================================================== */}
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 flex-1 print:p-0 print:m-0 print:max-w-none">
        
        {/* ================================================================ */}
        {/* HEADER & DATE NAVIGATOR (SCREEN ONLY)                            */}
        {/* ================================================================ */}
        <section className="print:hidden rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Date Switcher: Tomorrow (Default) vs Today */}
            <div className="flex items-center space-x-2 p-1.5 rounded-2xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedDateMode("tomorrow")}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-bengali transition-all duration-200 flex items-center space-x-2",
                  selectedDateMode === "tomorrow"
                    ? "bg-emerald-500 text-slate-950 shadow-emerald-glow scale-[1.02]"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Calendar className="w-4 h-4" />
                <span>আগামীকাল (Tomorrow)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDateMode("today")}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-bengali transition-all duration-200 flex items-center space-x-2",
                  selectedDateMode === "today"
                    ? "bg-emerald-500 text-slate-950 shadow-emerald-glow scale-[1.02]"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Clock className="w-4 h-4" />
                <span>আজকের দিন (Today)</span>
              </button>
            </div>

            {/* Live 10:00 PM Booking Window Status Badge */}
            <div className="flex items-center space-x-3">
              <div
                className={cn(
                  "px-3.5 py-2 rounded-2xl border flex items-center space-x-2 text-xs font-bold font-bengali shadow-md",
                  cutoff?.isLocked
                    ? "bg-rose-950/80 border-rose-500/50 text-rose-300"
                    : "bg-emerald-950/80 border-emerald-500/50 text-emerald-300"
                )}
              >
                {cutoff?.isLocked ? (
                  <>
                    <Lock className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>রাত ১০:০০ বুকিং লকড (Locked)</span>
                  </>
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping flex-shrink-0" />
                    <Unlock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>রাত ১০:০০ বুকিং উইন্ডো উন্মুক্ত (Open)</span>
                  </>
                )}
              </div>

              {/* View Tab Switcher */}
              <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab("slip")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-bold transition-colors font-bengali",
                    activeTab === "slip"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  কিচেন স্লিপ (Slip)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("monthly")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-bold transition-colors font-bengali",
                    activeTab === "monthly"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  মাসিক গণনা (Monthly)
                </button>
              </div>
            </div>
          </div>

          {/* Action Toolbar: Print & CSV Export */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-400 font-mono flex items-center space-x-2">
              <span className="text-slate-300 font-bold">
                নির্ধারিত তারিখ: {dates?.targetDate || "..."}
              </span>
              <span>•</span>
              <span>{dates?.bstTime || "Asia/Dhaka"}</span>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={handlePrintSlip}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-bold text-xs font-bengali shadow-md transition-all flex items-center space-x-2 active:scale-95"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>🖨️ প্রিন্ট স্লিপ (Print Kitchen Slip)</span>
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-bengali shadow-emerald-glow transition-all flex items-center space-x-2 active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-950" />
                <span>📥 এক্সেল এক্সপোর্ট (Export CSV)</span>
              </button>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* PRINTABLE INSTITUTIONAL HEADER (PRINT ONLY)                      */}
        {/* ================================================================ */}
        <div className="hidden print:block text-black p-4 border-b-2 border-black space-y-2 mb-4">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black uppercase tracking-wider">
              বাংলাদেশ ইউনিভার্সিটি অব প্রফেশনালস (বিইউপি)
            </h1>
            <h2 className="text-lg font-bold">
              হল ডাইনিং কিচেন কুকিং স্লিপ (Kitchen Production Demand)
            </h2>
            <div className="flex items-center justify-center space-x-4 text-sm font-semibold pt-1">
              <span>রান্নার তারিখ: <strong>{dates?.targetDate}</strong></span>
              <span>•</span>
              <span>মুদ্রণ সময়: {new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} (BST)</span>
              <span>•</span>
              <span>স্ট্যাটাস: {cutoff?.isLocked ? "চূড়ান্ত অর্ডার (Locked)" : "প্রাথমিক অর্ডার (Open)"}</span>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* TAB 1: THE COOK'S SLIP & METRIC CARDS                            */}
        {/* ================================================================ */}
        {activeTab === "slip" && (
          <div className="space-y-6">
            {/* The Cook's Slip Title */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white font-bengali flex items-center space-x-2 print:text-black">
                  <span>পরবর্তী দিনের মোট মিলের চাহিদা (The Cook&apos;s Slip)</span>
                </h2>
                <p className="text-xs text-slate-400 font-sans print:text-black">
                  Calculated from confirmed student meal bookings for {dates?.targetDate}
                </p>
              </div>

              {/* Total Plates Badge */}
              <div className="px-4 py-1.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs sm:text-sm print:border-black print:text-black">
                TOTAL: <span className="text-base sm:text-lg font-black text-white print:text-black">{cookSlip?.totalMeals || 0}</span> PLATES
              </div>
            </div>

            {/* Three Large Bold Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* 1. BREAKFAST CARD */}
              <div className="rounded-3xl bg-slate-900/90 border border-amber-500/30 p-5 shadow-lg relative overflow-hidden flex flex-col justify-between print:border-black print:bg-white print:text-black">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 print:border-black">
                  <div className="flex items-center space-x-2 text-amber-400 print:text-black">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center font-bold">
                      <Coffee className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold font-bengali">🍳 সকাল (Breakfast)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 print:text-black">07:00 – 10:30 AM</span>
                </div>

                <div className="py-4 text-center sm:text-left">
                  <div className="text-4xl sm:text-5xl font-black text-white font-mono tracking-tight print:text-black">
                    {cookSlip?.breakfast || 0}
                  </div>
                  <div className="text-xs text-slate-400 font-bengali pt-1 print:text-black">
                    জন শিক্ষার্থীর নাস্তা অর্ডার
                  </div>
                </div>

                {/* Subtext: Difference compared to today's consumption */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs print:border-black">
                  <span className="text-slate-400 print:text-black font-bengali">আজকের তুলনায়:</span>
                  <div
                    className={cn(
                      "font-mono font-bold flex items-center space-x-1",
                      (cookSlip?.diff.breakfast || 0) >= 0 ? "text-emerald-400" : "text-rose-400",
                      "print:text-black"
                    )}
                  >
                    {(cookSlip?.diff.breakfast || 0) >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {(cookSlip?.diff.breakfast || 0) >= 0 ? "+" : ""}
                      {cookSlip?.diff.breakfast || 0} vs today
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. LUNCH CARD */}
              <div className="rounded-3xl bg-slate-900/90 border border-emerald-500/30 p-5 shadow-lg relative overflow-hidden flex flex-col justify-between print:border-black print:bg-white print:text-black">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 print:border-black">
                  <div className="flex items-center space-x-2 text-emerald-400 print:text-black">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center font-bold">
                      <Sun className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold font-bengali">🍛 দুপুর (Lunch)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 print:text-black">11:30 AM – 03:30 PM</span>
                </div>

                <div className="py-4 text-center sm:text-left">
                  <div className="text-4xl sm:text-5xl font-black text-white font-mono tracking-tight print:text-black">
                    {cookSlip?.lunch || 0}
                  </div>
                  <div className="text-xs text-slate-400 font-bengali pt-1 print:text-black">
                    জন শিক্ষার্থীর দুপুরের মিল অর্ডার
                  </div>
                </div>

                {/* Subtext: Difference compared to today's consumption */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs print:border-black">
                  <span className="text-slate-400 print:text-black font-bengali">আজকের তুলনায়:</span>
                  <div
                    className={cn(
                      "font-mono font-bold flex items-center space-x-1",
                      (cookSlip?.diff.lunch || 0) >= 0 ? "text-emerald-400" : "text-rose-400",
                      "print:text-black"
                    )}
                  >
                    {(cookSlip?.diff.lunch || 0) >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {(cookSlip?.diff.lunch || 0) >= 0 ? "+" : ""}
                      {cookSlip?.diff.lunch || 0} vs today
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. DINNER CARD */}
              <div className="rounded-3xl bg-slate-900/90 border border-indigo-500/30 p-5 shadow-lg relative overflow-hidden flex flex-col justify-between print:border-black print:bg-white print:text-black">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 print:border-black">
                  <div className="flex items-center space-x-2 text-indigo-400 print:text-black">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center font-bold">
                      <Moon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold font-bengali">🍲 রাত (Dinner)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 print:text-black">06:30 – 10:30 PM</span>
                </div>

                <div className="py-4 text-center sm:text-left">
                  <div className="text-4xl sm:text-5xl font-black text-white font-mono tracking-tight print:text-black">
                    {cookSlip?.dinner || 0}
                  </div>
                  <div className="text-xs text-slate-400 font-bengali pt-1 print:text-black">
                    জন শিক্ষার্থীর রাতের মিল অর্ডার
                  </div>
                </div>

                {/* Subtext: Difference compared to today's consumption */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs print:border-black">
                  <span className="text-slate-400 print:text-black font-bengali">আজকের তুলনায়:</span>
                  <div
                    className={cn(
                      "font-mono font-bold flex items-center space-x-1",
                      (cookSlip?.diff.dinner || 0) >= 0 ? "text-emerald-400" : "text-rose-400",
                      "print:text-black"
                    )}
                  >
                    {(cookSlip?.diff.dinner || 0) >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {(cookSlip?.diff.dinner || 0) >= 0 ? "+" : ""}
                      {cookSlip?.diff.dinner || 0} vs today
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* BREAKDOWN BY WING / FLOOR                                      */}
            {/* ============================================================== */}
            <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-xl print:border-black print:bg-white print:text-black">
              <div
                onClick={() => setIsFloorSectionOpen(!isFloorSectionOpen)}
                className="p-5 flex items-center justify-between cursor-pointer select-none border-b border-slate-800 print:border-black"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 print:text-black">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white font-bengali print:text-black">
                      ফ্লোর ও উইং ভিত্তিক চাহিদার বিভাজন (Breakdown by Wing / Floor)
                    </h3>
                    <p className="text-xs text-slate-400 font-sans print:text-black">
                      Dining orders categorized by student room floors
                    </p>
                  </div>
                </div>

                <div className="p-1 rounded-lg text-slate-400 hover:text-white print:hidden">
                  {isFloorSectionOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>

              {/* Collapsible Floor Breakdown Table */}
              {isFloorSectionOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm font-sans border-collapse">
                    <thead>
                      <tr className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider print:bg-gray-100 print:text-black print:border-black">
                        <th className="py-3 px-4 font-bold">ফ্লোর নম্বর (Floor)</th>
                        <th className="py-3 px-4 font-bold text-amber-400 print:text-black">🍳 সকাল (Breakfast)</th>
                        <th className="py-3 px-4 font-bold text-emerald-400 print:text-black">🍛 দুপুর (Lunch)</th>
                        <th className="py-3 px-4 font-bold text-indigo-400 print:text-black">🍲 রাত (Dinner)</th>
                        <th className="py-3 px-4 font-bold text-right text-white print:text-black">মোট প্লেট (Total)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono print:divide-black">
                      {floors.map((item) => (
                        <tr
                          key={item.floor}
                          className="hover:bg-slate-800/40 transition-colors print:hover:bg-transparent"
                        >
                          <td className="py-3 px-4 font-bold text-slate-200 flex items-center space-x-2 print:text-black">
                            <Building className="w-4 h-4 text-emerald-400 print:text-black" />
                            <span>{item.floor} ({toBengaliDigits(item.floorNumber)}ম তলা)</span>
                          </td>
                          <td className="py-3 px-4 text-amber-300 font-bold print:text-black">
                            {item.breakfast}
                          </td>
                          <td className="py-3 px-4 text-emerald-300 font-bold print:text-black">
                            {item.lunch}
                          </td>
                          <td className="py-3 px-4 text-indigo-300 font-bold print:text-black">
                            {item.dinner}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-white print:text-black">
                            {item.total}
                          </td>
                        </tr>
                      ))}

                      {/* Summary Row */}
                      <tr className="bg-slate-950/90 font-black border-t-2 border-slate-700 text-slate-100 print:bg-gray-200 print:text-black print:border-black">
                        <td className="py-3 px-4 font-bengali">সর্বমোট (Grand Total)</td>
                        <td className="py-3 px-4 text-amber-400 print:text-black">{cookSlip?.breakfast || 0}</td>
                        <td className="py-3 px-4 text-emerald-400 print:text-black">{cookSlip?.lunch || 0}</td>
                        <td className="py-3 px-4 text-indigo-400 print:text-black">{cookSlip?.dinner || 0}</td>
                        <td className="py-3 px-4 text-right text-emerald-400 print:text-black">{cookSlip?.totalMeals || 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: MONTHLY MEAL COUNTER (ZERO FINANCIALS FOR MVP)             */}
        {/* ================================================================ */}
        {activeTab === "monthly" && (
          <div className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white font-bengali flex items-center space-x-2">
                  <span>মাসিক মিল গণনা (Monthly Physical Consumption Tally)</span>
                </h2>
                <p className="text-xs text-slate-400 font-sans">
                  Current calendar month aggregated verification logs ({monthly?.monthNameEn})
                </p>
              </div>

              {/* Zero Financials MVP Constraint Banner */}
              <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Zero Financials MVP: Physical Meal Quantities Only</span>
              </div>
            </div>

            {/* Total Month Metric Banner */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-teal-950/70 border border-emerald-500/40 text-center space-y-1">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300">
                চলতি মাসে মোট সংগৃহীত খাবার (Total Verified Meals Consumed)
              </span>
              <div className="text-5xl font-black text-white font-mono tracking-tight">
                {monthly?.totalConsumed || 0}
              </div>
              <div className="text-xs text-slate-400 font-bengali">
                {monthly?.monthNameBn} মাসে হলে পরিবেশিত মোট মিলের সংখ্যা
              </div>
            </div>

            {/* 3-Way Shift Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-1">
                <Coffee className="w-5 h-5 mx-auto text-amber-400" />
                <div className="text-xs font-bengali text-slate-400">সকালের নাস্তা (Breakfast)</div>
                <div className="text-2xl font-bold font-mono text-amber-300">
                  {monthly?.breakfast || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-1">
                <Sun className="w-5 h-5 mx-auto text-emerald-400" />
                <div className="text-xs font-bengali text-slate-400">দুপুরের খাবার (Lunch)</div>
                <div className="text-2xl font-bold font-mono text-emerald-300">
                  {monthly?.lunch || 0}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-1">
                <Moon className="w-5 h-5 mx-auto text-indigo-400" />
                <div className="text-xs font-bengali text-slate-400">রাতের খাবার (Dinner)</div>
                <div className="text-2xl font-bold font-mono text-indigo-300">
                  {monthly?.dinner || 0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SIGNATURE SECTION (PRINT ONLY)                                    */}
        {/* ================================================================ */}
        <div className="hidden print:block pt-12 text-black text-sm">
          <div className="grid grid-cols-2 gap-8 text-center pt-8">
            <div className="border-t border-black pt-2">
              <p className="font-bold">প্রধান বাবুর্চি / হেড কুক স্বাক্ষর</p>
              <p className="text-xs text-gray-600">Head Cook Signature &amp; Date</p>
            </div>
            <div className="border-t border-black pt-2">
              <p className="font-bold">মেস ম্যানেজার / হল সুপারভাইজার স্বাক্ষর</p>
              <p className="text-xs text-gray-600">Mess Supervisor Signature &amp; Approval</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
