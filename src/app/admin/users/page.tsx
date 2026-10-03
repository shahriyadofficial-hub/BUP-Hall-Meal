"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Search,
  Filter,
  ShieldCheck,
  ShieldAlert,
  Mail,
  GraduationCap,
  Sparkles,
  RotateCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building2,
  ArrowUpDown,
  Lock,
  Unlock,
  ExternalLink,
  ChevronRight,
  User,
  Hash,
} from "lucide-react";
import { playFeedback } from "@/lib/audio-feedback";
import { cn, toBengaliDigits } from "@/lib/utils";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";

interface AdminUserRecord {
  id: string;
  student_id: string;
  full_name: string;
  email: string;
  department: string;
  hall: "male" | "female";
  room_number: string;
  avatar_url: string | null;
  profile_photo_url: string | null;
  hall_serial: string;
  raw_serial: number | null;
  auth_provider: string;
  login_type: "bup_edu" | "personal_gmail";
  role: "student" | "staff" | "admin";
  is_approved: boolean;
  created_at: string;
}

interface UserStats {
  total: number;
  bupEdu: number;
  gmail: number;
  blocked: number;
}

export default function AdminUsersAuditPage() {
  const { isBengali, t } = useTranslation();
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [stats, setStats] = useState<UserStats>({
    total: 0,
    bupEdu: 0,
    gmail: 0,
    blocked: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState<"all" | "bup_edu" | "personal_gmail">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">("all");

  // Toggling state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "warning" } | null>(null);

  const fetchUsers = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.users || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load admin users:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Toggle Block / Approve user
  const handleToggleStatus = async (user: AdminUserRecord) => {
    const nextApproved = !user.is_approved;
    setActionInProgressId(user.id);

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          is_approved: nextApproved,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        playFeedback("error");
        setToastMessage({ text: data.error || "Failed to update status", type: "warning" });
        return;
      }

      // Optimistic update
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_approved: nextApproved } : u))
      );

      setStats((prev) => ({
        ...prev,
        blocked: nextApproved ? prev.blocked - 1 : prev.blocked + 1,
      }));

      playFeedback(nextApproved ? "success" : "warning");
      setToastMessage({
        text: `${user.full_name} is now ${nextApproved ? "Active / Approved" : "Blocked"}`,
        type: nextApproved ? "success" : "warning",
      });

      setTimeout(() => setToastMessage(null), 3500);
    } catch {
      playFeedback("error");
      setToastMessage({ text: "Network error occurred", type: "warning" });
    } finally {
      setActionInProgressId(null);
    }
  };

  // Instant Role Change handler
  const handleRoleChange = async (user: AdminUserRecord, nextRole: "student" | "staff" | "admin") => {
    setActionInProgressId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          role: nextRole,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        playFeedback("error");
        setToastMessage({ text: data.error || "Failed to update role", type: "warning" });
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u))
      );

      playFeedback("success");
      setToastMessage({
        text: `${user.full_name}'s role updated to ${nextRole.toUpperCase()}`,
        type: "success",
      });

      setTimeout(() => setToastMessage(null), 3500);
    } catch {
      playFeedback("error");
      setToastMessage({ text: "Network error occurred", type: "warning" });
    } finally {
      setActionInProgressId(null);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = u.full_name.toLowerCase().includes(q);
        const matchesId = u.student_id.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesSerial = u.hall_serial.toLowerCase().includes(q);
        const matchesDept = u.department.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesEmail && !matchesSerial && !matchesDept) {
          return false;
        }
      }

      // Account type filter
      if (accountTypeFilter !== "all" && u.login_type !== accountTypeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === "active" && !u.is_approved) return false;
      if (statusFilter === "blocked" && u.is_approved) return false;

      return true;
    });
  }, [users, searchQuery, accountTypeFilter, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Admin Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-emerald-glow text-slate-950">
            <Users className="w-5 h-5 font-bold" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                {isBengali ? "শিক্ষার্থী ডিরেক্টরি ও অডিট লগ" : "Student Directory & Audit Log"}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {isBengali ? "অ্যাডমিন" : "ADMIN"}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {isBengali
                ? "বাংলাদেশ ইউনিভার্সিটি অব প্রফেশনালস • আবাসিক হল ডাইনিং সিস্টেম"
                : "Bangladesh University of Professionals • Residential Hall Dining System"}
            </p>
          </div>
        </div>

        {/* Quick Links & Refresh */}
        <div className="flex items-center space-x-2">
          <Link
            href="/counter"
            className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all flex items-center space-x-1.5"
          >
            <span>{isBengali ? "কাউন্টার টার্মিনাল" : "Counter Terminal"}</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </Link>

          <button
            type="button"
            onClick={() => fetchUsers(true)}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
            title={isBengali ? "তথ্য রিফ্রেশ করুন" : "Refresh User Data"}
          >
            <RotateCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-emerald-400")} />
          </button>

          <LanguageToggle />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Toast Alert */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={cn(
                "fixed top-4 right-4 z-50 p-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-center space-x-3 text-sm font-semibold",
                toastMessage.type === "success"
                  ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-glow"
                  : "bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-crimson-glow"
              )}
            >
              {toastMessage.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* STATS OVERVIEW TILES (iOS Glassy Cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-3xl p-4 sm:p-5 bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">
                {isBengali ? "মোট নিবন্ধিত" : "Total Registered"}
              </span>
              <p className="text-2xl font-mono font-extrabold text-slate-100">
                {isBengali ? toBengaliDigits(stats.total) : stats.total}
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-300">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-3xl p-4 sm:p-5 bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-emerald-400/90 font-medium">
                {isBengali ? "বিইউপি এডু-মেইল" : "BUP Edu-mails"}
              </span>
              <p className="text-2xl font-mono font-extrabold text-emerald-300">
                {isBengali ? toBengaliDigits(stats.bupEdu) : stats.bupEdu}
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-3xl p-4 sm:p-5 bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-amber-400/90 font-medium">
                {isBengali ? "ব্যক্তিগত জিমেইল" : "Personal Gmail"}
              </span>
              <p className="text-2xl font-mono font-extrabold text-amber-300">
                {isBengali ? toBengaliDigits(stats.gmail) : stats.gmail}
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Mail className="w-5 h-5" />
            </div>
          </div>

          <div className="rounded-3xl p-4 sm:p-5 bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-lg flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-rose-400/90 font-medium">
                {isBengali ? "ব্লকড / স্থগিত" : "Blocked / Suspended"}
              </span>
              <p className="text-2xl font-mono font-extrabold text-rose-300">
                {isBengali ? toBengaliDigits(stats.blocked) : stats.blocked}
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="rounded-3xl p-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isBengali
                  ? "সিরিয়াল (#০৪২), নাম, শিক্ষার্থী আইডি, ইমেইল বা বিভাগ দিয়ে খুঁজুন..."
                  : "Search by Serial (#042), Name, Student ID, Email, Dept..."
              }
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center space-x-2">
            {/* Account Type Filter */}
            <select
              value={accountTypeFilter}
              onChange={(e) => setAccountTypeFilter(e.target.value as "all" | "bup_edu" | "personal_gmail")}
              className="px-3 py-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">{isBengali ? "সকল অ্যাকাউন্ট টাইপ" : "All Account Types"}</option>
              <option value="bup_edu">{isBengali ? "🎓 বিইউপি এডু মেইল" : "🎓 BUP Edu Mail"}</option>
              <option value="personal_gmail">{isBengali ? "✉️ ব্যক্তিগত জিমেইল" : "✉️ Personal Gmail"}</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "blocked")}
              className="px-3 py-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">{isBengali ? "সকল অবস্থা" : "All Statuses"}</option>
              <option value="active">{isBengali ? "শুধুমাত্র সক্রিয়" : "Active Only"}</option>
              <option value="blocked">{isBengali ? "শুধুমাত্র ব্লকড" : "Blocked Only"}</option>
            </select>
          </div>
        </div>

        {/* AUDIT TABLE */}
        <div className="rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/50 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">{isBengali ? "সিরিয়াল #" : "Serial #"}</th>
                  <th className="py-3.5 px-4">{isBengali ? "শিক্ষার্থী" : "Student"}</th>
                  <th className="py-3.5 px-4">{isBengali ? "শিক্ষার্থী আইডি" : "Student ID"}</th>
                  <th className="py-3.5 px-4">{isBengali ? "বিভাগ" : "Department"}</th>
                  <th className="py-3.5 px-4">{isBengali ? "ইমেইল" : "Email"}</th>
                  <th className="py-3.5 px-4">{isBengali ? "রোল" : "Role"}</th>
                  <th className="py-3.5 px-4">{isBengali ? "অ্যাকাউন্টের ধরণ" : "Account Type"}</th>
                  <th className="py-3.5 px-4">{isBengali ? "অবস্থা" : "Status"}</th>
                  <th className="py-3.5 px-4 text-right">{isBengali ? "অডিট অ্যাকশন" : "Audit Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs text-slate-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <div className="flex items-center justify-center space-x-2">
                        <RotateCw className="w-5 h-5 animate-spin text-emerald-400" />
                        <span>{isBengali ? "শিক্ষার্থী তালিকা লোড হচ্ছে..." : "Loading student directory..."}</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      {isBengali
                        ? "অনুসন্ধানের শর্তানুযায়ী কোনো শিক্ষার্থী পাওয়া যায়নি।"
                        : "No students found matching your search and filter criteria."}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isProcessing = actionInProgressId === user.id;

                    return (
                      <tr
                        key={user.id}
                        className={cn(
                          "transition-colors hover:bg-slate-800/40",
                          !user.is_approved && "bg-rose-950/10"
                        )}
                      >
                        {/* Serial # */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 font-mono font-bold text-emerald-300 text-xs">
                            <Hash className="w-3 h-3 text-slate-400" />
                            <span>{isBengali ? toBengaliDigits(user.hall_serial) : user.hall_serial}</span>
                          </span>
                        </td>

                        {/* Student Details (Avatar + Name) */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-emerald-500/30 overflow-hidden flex items-center justify-center flex-shrink-0">
                              {user.avatar_url || user.profile_photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={user.avatar_url || user.profile_photo_url || ""}
                                  alt={user.full_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-4 h-4 text-emerald-400" />
                              )}
                            </div>
                            <div className="truncate leading-tight">
                              <p className="font-semibold text-slate-100 truncate">{user.full_name}</p>
                              <p className="text-[11px] text-slate-400">
                                {isBengali
                                  ? `${user.hall === "female" ? "ছাত্রী হল" : "ছাত্র হল"} • রুম ${toBengaliDigits(user.room_number)}`
                                  : `${user.hall === "female" ? "Female Hall" : "Male Hall"} • Room ${user.room_number}`}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Student ID */}
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-200">
                          {isBengali ? toBengaliDigits(user.student_id) : user.student_id}
                        </td>

                        {/* Department */}
                        <td className="py-3.5 px-4 text-slate-300 truncate max-w-[200px]" title={user.department}>
                          {user.department}
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px] truncate max-w-[220px]" title={user.email}>
                          {user.email}
                        </td>

                        {/* Role Select Dropdown */}
                        <td className="py-3.5 px-4">
                          <select
                            value={user.role || "student"}
                            disabled={isProcessing}
                            onChange={(e) => handleRoleChange(user, e.target.value as "student" | "staff" | "admin")}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all focus:outline-none cursor-pointer",
                              user.role === "admin"
                                ? "bg-purple-950/60 border-purple-500/50 text-purple-300"
                                : user.role === "staff"
                                ? "bg-blue-950/60 border-blue-500/50 text-blue-300"
                                : "bg-emerald-950/60 border-emerald-500/50 text-emerald-300"
                            )}
                          >
                            <option value="student" className="bg-slate-900 text-emerald-300">
                              {isBengali ? "🎓 শিক্ষার্থী" : "🎓 Student"}
                            </option>
                            <option value="staff" className="bg-slate-900 text-blue-300">
                              {isBengali ? "🛡️ স্টাফ" : "🛡️ Staff"}
                            </option>
                            <option value="admin" className="bg-slate-900 text-purple-300">
                              {isBengali ? "👑 অ্যাডমিন" : "👑 Admin"}
                            </option>
                          </select>
                        </td>

                        {/* Account Type Badge */}
                        <td className="py-3.5 px-4">
                          {user.login_type === "bup_edu" ? (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <GraduationCap className="w-3 h-3" />
                              <span>{isBengali ? "বিইউপি এডু" : "BUP Edu"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <Mail className="w-3 h-3" />
                              <span>{isBengali ? "ব্যক্তিগত জিমেইল" : "Personal Gmail"}</span>
                            </span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4">
                          {user.is_approved ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span>{isBengali ? "সক্রিয়" : "Active"}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              <span>{isBengali ? "ব্লকড" : "Blocked"}</span>
                            </span>
                          )}
                        </td>

                        {/* Quick Audit Action Toggle */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleToggleStatus(user)}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center space-x-1.5 shadow-sm",
                              user.is_approved
                                ? "bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40"
                                : "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-glow"
                            )}
                          >
                            {isProcessing ? (
                              <RotateCw className="w-3.5 h-3.5 animate-spin" />
                            ) : user.is_approved ? (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>{isBengali ? "ব্লক করুন" : "Block"}</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>{isBengali ? "আনব্লক করুন" : "Unblock"}</span>
                              </>
                            )}
                          </button>
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
