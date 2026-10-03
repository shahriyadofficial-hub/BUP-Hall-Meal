"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Users,
  Utensils,
  Calendar,
  Filter,
  Search,
  Download,
  Printer,
  RotateCw,
  Coffee,
  Sun,
  Moon,
  Clock,
  ArrowRight,
  Hash,
  User,
  CheckCircle2,
  FileSpreadsheet,
  Building2,
  ExternalLink,
} from "lucide-react";
import { playFeedback } from "@/lib/audio-feedback";
import { formatHallSerial } from "@/lib/hall-serial";
import { cn } from "@/lib/utils";
import { MealType } from "@/types";

interface MealLogEntry {
  id: string;
  user_id: string;
  meal_date?: string;
  consumed_date?: string;
  meal_type: MealType;
  status: "consumed" | "booked" | "cancelled";
  claimed_at?: string;
  consumed_at?: string;
  created_at?: string;
  users?: {
    id: string;
    student_id: string;
    full_name: string;
    hall_serial: string | number;
    room_number: string;
    hall: string;
    department: string;
  } | null;
}

interface DiningStats {
  total: number;
  breakfast: number;
  lunch: number;
  dinner: number;
  consumed: number;
  uniqueStudentsCount: number;
}

const MONTH_OPTIONS = [
  { value: "2026-10", label: "October 2026" },
  { value: "2026-09", label: "September 2026" },
  { value: "2026-08", label: "August 2026" },
  { value: "2026-07", label: "July 2026" },
  { value: "2026-06", label: "June 2026" },
];

export default function AdminDashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedShift, setSelectedShift] = useState<"all" | MealType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [logs, setLogs] = useState<MealLogEntry[]>([]);
  const [stats, setStats] = useState<DiningStats>({
    total: 0,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    consumed: 0,
    uniqueStudentsCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch monthly dining logs
  const fetchDiningLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMonth) params.set("month", selectedMonth);
      if (selectedDate) params.set("date", selectedDate);
      if (selectedShift !== "all") params.set("meal_type", selectedShift);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/admin/meal-logs?${params.toString()}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("[AdminDashboard] Error fetching logs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedDate, selectedShift, searchQuery]);

  useEffect(() => {
    fetchDiningLogs();
  }, [fetchDiningLogs]);

  // Export Filtered Table to CSV
  const handleExportCSV = () => {
    playFeedback("click");
    if (logs.length === 0) return;

    const headers = [
      "Date",
      "Hall Serial",
      "Student ID",
      "Student Name",
      "Department",
      "Room #",
      "Meal Shift",
      "Status",
      "Claimed Time (BST)",
    ];

    const rows = logs.map((log) => {
      const date = log.meal_date || log.consumed_date || log.created_at?.split("T")[0] || "";
      const serial = log.users?.hall_serial ? formatHallSerial(String(log.users.hall_serial)) : "N/A";
      const studentId = log.users?.student_id || "N/A";
      const name = log.users?.full_name || "Unknown";
      const dept = log.users?.department || "General";
      const room = log.users?.room_number || "N/A";
      const shift = log.meal_type;
      const status = log.status;
      const claimTime = log.claimed_at || log.consumed_at || log.created_at || "";

      let formattedTime = "";
      if (claimTime) {
        try {
          formattedTime = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Dhaka",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }).format(new Date(claimTime));
        } catch {
          formattedTime = claimTime;
        }
      }

      return [
        `"${date}"`,
        `"${serial}"`,
        `"${studentId}"`,
        `"${name}"`,
        `"${dept}"`,
        `"${room}"`,
        `"${shift.toUpperCase()}"`,
        `"${status.toUpperCase()}"`,
        `"${formattedTime}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bup_dining_report_${selectedMonth}.csv`);
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    playFeedback("click");
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const formatBSTTime = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(isoString));
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background Institutional Glow */}
      <div className="fixed top-10 left-1/2 -translate-x-1/2 w-full max-w-6xl h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navbar */}
      <nav className="print:hidden sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-emerald-glow text-slate-950">
            <ShieldCheck className="w-5 h-5 font-bold" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                BUP Dining Executive Administration
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ADMIN
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Central Command, Hall Dining Ledger & Role Control
            </p>
          </div>
        </div>

        {/* Portal Quick Links */}
        <div className="flex items-center space-x-2">
          <Link
            href="/admin/users"
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>User Management</span>
          </Link>

          <Link
            href="/admin/approvals"
            className="hidden sm:flex px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 items-center space-x-1.5 transition-colors shadow-sm"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Approvals</span>
          </Link>

          <Link
            href="/counter"
            className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-emerald-glow"
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Counter Terminal</span>
          </Link>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 sm:py-8 space-y-6 z-10">
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          {/* Total Meals */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Total Logged</span>
              <p className="text-2xl font-mono font-extrabold text-emerald-400">{stats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Utensils className="w-5 h-5" />
            </div>
          </div>

          {/* Consumed */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Consumed Meals</span>
              <p className="text-2xl font-mono font-extrabold text-teal-300">{stats.consumed}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-300">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          {/* Breakfast */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Breakfast</span>
              <p className="text-2xl font-mono font-extrabold text-amber-400">{stats.breakfast}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Coffee className="w-5 h-5" />
            </div>
          </div>

          {/* Lunch */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Lunch</span>
              <p className="text-2xl font-mono font-extrabold text-emerald-400">{stats.lunch}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sun className="w-5 h-5" />
            </div>
          </div>

          {/* Dinner */}
          <div className="rounded-2xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 flex items-center justify-between col-span-2 md:col-span-1">
            <div>
              <span className="text-xs text-slate-400">Dinner</span>
              <p className="text-2xl font-mono font-extrabold text-indigo-400">{stats.dinner}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Moon className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* MONTHLY HALL DINING LOG SECTION */}
        <section className="space-y-4">
          {/* Header & Export Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                <span>Monthly Hall Dining Log</span>
              </h2>
              <p className="text-xs text-slate-400">
                Physical meal consumption ledger aggregated across all resident students
              </p>
            </div>

            <div className="flex items-center space-x-2 print:hidden">
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center space-x-1.5 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center space-x-1.5 transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4 text-slate-300" />
                <span>Print Log</span>
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="print:hidden rounded-3xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by Student Name, ID, or Hall Serial..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Month Picker */}
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setSelectedDate("");
                }}
                className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>

              {/* Exact Date Picker */}
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-medium text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />

              {/* Shift Filter */}
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as "all" | MealType)}
                className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-bold text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="all">All Shifts</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
              </select>

              {(selectedDate || selectedShift !== "all" || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate("");
                    setSelectedShift("all");
                    setSearchQuery("");
                  }}
                  className="px-2.5 py-2 text-xs text-rose-400 hover:text-rose-300 font-semibold"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Dining Log Table */}
          <div className="rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4">Student</th>
                    <th className="py-3.5 px-4">Serial #</th>
                    <th className="py-3.5 px-4">Department</th>
                    <th className="py-3.5 px-4">Room #</th>
                    <th className="py-3.5 px-4">Meal Shift</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Claimed (BST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs text-slate-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <div className="flex items-center justify-center space-x-2">
                          <RotateCw className="w-5 h-5 animate-spin text-emerald-400" />
                          <span>Loading monthly dining log...</span>
                        </div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No dining log records found matching the active filters.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const dateStr =
                        log.meal_date || log.consumed_date || log.created_at?.split("T")[0] || "—";
                      const student = log.users;
                      const claimTime = log.claimed_at || log.consumed_at || log.created_at;

                      return (
                        <tr key={log.id} className="transition-colors hover:bg-slate-800/40">
                          {/* Date */}
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                            {dateStr}
                          </td>

                          {/* Student Details */}
                          <td className="py-3.5 px-4">
                            <div className="truncate leading-tight">
                              <p className="font-semibold text-slate-100 truncate">
                                {student?.full_name || "Unknown Student"}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                ID: {student?.student_id || "N/A"}
                              </p>
                            </div>
                          </td>

                          {/* Hall Serial */}
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-800 font-mono font-bold text-emerald-300 text-xs border border-slate-700">
                              #{student?.hall_serial ? formatHallSerial(String(student.hall_serial)) : "N/A"}
                            </span>
                          </td>

                          {/* Department */}
                          <td className="py-3.5 px-4 text-slate-300 truncate max-w-[180px]">
                            {student?.department || "General"}
                          </td>

                          {/* Room # */}
                          <td className="py-3.5 px-4 font-mono text-slate-300">
                            {student?.room_number || "N/A"}
                          </td>

                          {/* Meal Shift Badge */}
                          <td className="py-3.5 px-4">
                            <span
                              className={cn(
                                "inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                                log.meal_type === "breakfast" &&
                                  "bg-amber-500/10 border-amber-500/30 text-amber-300",
                                log.meal_type === "lunch" &&
                                  "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
                                log.meal_type === "dinner" &&
                                  "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                              )}
                            >
                              {log.meal_type === "breakfast" && <Coffee className="w-3 h-3" />}
                              {log.meal_type === "lunch" && <Sun className="w-3 h-3" />}
                              {log.meal_type === "dinner" && <Moon className="w-3 h-3" />}
                              <span className="capitalize">{log.meal_type}</span>
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {log.status === "consumed" ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span>Consumed</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                <span>Booked</span>
                              </span>
                            )}
                          </td>

                          {/* Claimed Time */}
                          <td className="py-3.5 px-4 font-mono text-right text-slate-300">
                            {formatBSTTime(claimTime)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
