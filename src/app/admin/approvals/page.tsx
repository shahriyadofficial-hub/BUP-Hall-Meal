"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Building2,
  Phone,
  DoorClosed,
  GraduationCap,
  Calendar,
  Droplet,
  RefreshCw,
  AlertTriangle,
  ZoomIn,
  X,
  CheckSquare,
  Square,
  Lock,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { playFeedback } from "@/lib/audio-feedback";
import { supabase } from "@/lib/supabase/client";
import { toBengaliDigits } from "@/lib/utils";
import { HallType } from "@/types";

interface PendingStudent {
  id: string;
  student_id: string;
  full_name: string;
  email: string;
  hall: HallType;
  room_number: string;
  department?: string;
  blood_group?: string;
  session?: string;
  phone_number: string;
  profile_photo_url: string | null;
  is_approved: boolean;
  created_at: string;
}

interface StatsData {
  pendingApprovals: number;
  approvedThisMonth: number;
  totalRegistered: number;
}

export default function AdminApprovalsPage() {
  const router = useRouter();
  const { t, isBengali } = useTranslation();

  // Role authentication check
  const [isAdminRole, setIsAdminRole] = useState(true); // Enabled by default with option to test role gate
  const [isAuthChecking, setIsAuthChecking] = useState(false);

  // Data states
  const [students, setStudents] = useState<PendingStudent[]>([]);
  const [stats, setStats] = useState<StatsData>({
    pendingApprovals: 0,
    approvedThisMonth: 0,
    totalRegistered: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHall, setSelectedHall] = useState<"all" | HallType>("all");

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Single Action state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Photo Zoom Modal state
  const [zoomedPhoto, setZoomedPhoto] = useState<{ url: string; name: string; id: string } | null>(null);

  // Rejection Dialog state
  const [rejectDialogTarget, setRejectDialogTarget] = useState<PendingStudent | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Feedback Notification Toast
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "reject"; text: string } | null>(null);

  /**
   * Helper to display temporary toast message
   */
  const showToast = useCallback((text: string, type: "success" | "reject" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  /**
   * Fetches pending students and statistics from the API
   */
  const loadApprovalsQueue = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/admin/approvals");
      const json = await res.json();
      if (json.success) {
        setStudents(json.students || []);
        if (json.stats) {
          setStats(json.stats);
        }
      }
    } catch (err) {
      console.error("[Admin Approvals] Fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadApprovalsQueue();
  }, [loadApprovalsQueue]);

  /**
   * Supabase Realtime Subscription:
   * Listens for changes on `public.users` table so newly submitted registrations
   * appear dynamically in the pending queue without manual page reloads.
   */
  useEffect(() => {
    const channel = supabase
      .channel("admin-users-approval-sync")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "users",
        },
        (payload) => {
          const newStudent = payload.new as PendingStudent;
          if (!newStudent.is_approved) {
            setStudents((prev) => {
              if (prev.some((s) => s.id === newStudent.id)) return prev;
              return [newStudent, ...prev];
            });
            setStats((prev) => ({
              ...prev,
              pendingApprovals: prev.pendingApprovals + 1,
              totalRegistered: prev.totalRegistered + 1,
            }));
            playFeedback("click");
            showToast(
              isBengali
                ? `নতুন নিবন্ধন যুক্ত হয়েছে: ${newStudent.full_name}`
                : `New registration queued: ${newStudent.full_name}`,
              "success"
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
        },
        (payload) => {
          const updated = payload.new as PendingStudent;
          if (updated.is_approved) {
            // Remove from pending queue if approved remotely
            setStudents((prev) => prev.filter((s) => s.id !== updated.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isBengali, showToast]);

  /**
   * Handle Single Student Approval
   */
  const handleApprove = async (student: PendingStudent) => {
    setActionInProgressId(student.id);
    try {
      const res = await fetch("/api/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          studentIds: [student.student_id],
          userIds: [student.id],
        }),
      });

      const json = await res.json();
      if (json.success) {
        // Play pleasant harmonic ascending chime
        playFeedback("success");
        showToast(
          isBengali
            ? `${student.full_name} (${student.student_id}) অনুমোদিত হয়েছে!`
            : `${student.full_name} (${student.student_id}) has been approved!`,
          "success"
        );

        // Update local state smoothly
        setStudents((prev) => prev.filter((s) => s.id !== student.id));
        setSelectedIds((prev) => prev.filter((id) => id !== student.id));
        setStats((prev) => ({
          ...prev,
          pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
          approvedThisMonth: prev.approvedThisMonth + 1,
        }));
      } else {
        alert(json.error || "Failed to approve student.");
      }
    } catch (err) {
      console.error("[handleApprove] Error:", err);
    } finally {
      setActionInProgressId(null);
    }
  };

  /**
   * Handle Bulk Approval of Selected Students
   */
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkProcessing(true);

    try {
      const selectedStudents = students.filter((s) => selectedIds.includes(s.id));
      const studentIds = selectedStudents.map((s) => s.student_id);

      const res = await fetch("/api/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_approve",
          studentIds,
          userIds: selectedIds,
        }),
      });

      const json = await res.json();
      if (json.success) {
        playFeedback("success");
        showToast(
          isBengali
            ? `${selectedIds.length} জন শিক্ষার্থীর প্রোফাইল সফলভাবে অনুমোদন করা হয়েছে!`
            : `Successfully approved ${selectedIds.length} student profile(s)!`,
          "success"
        );

        setStudents((prev) => prev.filter((s) => !selectedIds.includes(s.id)));
        setStats((prev) => ({
          ...prev,
          pendingApprovals: Math.max(0, prev.pendingApprovals - selectedIds.length),
          approvedThisMonth: prev.approvedThisMonth + selectedIds.length,
        }));
        setSelectedIds([]);
      } else {
        alert(json.error || "Failed to complete bulk approval.");
      }
    } catch (err) {
      console.error("[handleBulkApprove] Error:", err);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  /**
   * Handle Rejection with Stored Reason
   */
  const handleConfirmReject = async () => {
    if (!rejectDialogTarget) return;
    setIsRejecting(true);

    try {
      const res = await fetch("/api/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          studentIds: [rejectDialogTarget.student_id],
          userIds: [rejectDialogTarget.id],
          rejectionReason: rejectionReason || "Information mismatched with official hall registry.",
        }),
      });

      const json = await res.json();
      if (json.success) {
        playFeedback("reject");
        showToast(
          isBengali
            ? `${rejectDialogTarget.full_name}-এর আবেদন বাতিল করা হয়েছে। কারণ অডিট লগে লিপিবদ্ধ করা হয়েছে।`
            : `Registration for ${rejectDialogTarget.full_name} rejected. Reason logged in audit records.`,
          "reject"
        );

        setStudents((prev) => prev.filter((s) => s.id !== rejectDialogTarget.id));
        setSelectedIds((prev) => prev.filter((id) => id !== rejectDialogTarget.id));
        setStats((prev) => ({
          ...prev,
          pendingApprovals: Math.max(0, prev.pendingApprovals - 1),
        }));
        setRejectDialogTarget(null);
        setRejectionReason("");
      } else {
        alert(json.error || "Failed to reject registration.");
      }
    } catch (err) {
      console.error("[handleConfirmReject] Error:", err);
    } finally {
      setIsRejecting(false);
    }
  };

  /**
   * Filtered list based on search and selected hall
   */
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Hall filter
      if (selectedHall !== "all" && s.hall !== selectedHall) {
        return false;
      }

      // Search filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.student_id.toLowerCase().includes(q) ||
        s.full_name.toLowerCase().includes(q) ||
        s.room_number.toLowerCase().includes(q) ||
        s.phone_number.includes(q) ||
        (s.department && s.department.toLowerCase().includes(q))
      );
    });
  }, [students, selectedHall, searchQuery]);

  /**
   * Toggle select all visible
   */
  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredStudents.length && filteredStudents.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map((s) => s.id));
    }
  };

  /**
   * Toggle select single student
   */
  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Helper date formatter
  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const str = d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return isBengali ? toBengaliDigits(str) : str;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-slate-100 flex flex-col items-center px-3 py-6 sm:px-6 lg:px-8">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 z-50 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center space-x-2.5 text-xs font-semibold ${
              toastMessage.type === "success"
                ? "bg-slate-900/90 border-emerald-500/50 text-emerald-300 shadow-emerald-glow"
                : "bg-slate-900/90 border-rose-500/50 text-rose-300 shadow-crimson-glow"
            }`}
          >
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400" />
            )}
            <span className="font-bengali">{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-6xl space-y-6">
        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-emerald-glow">
              <ShieldCheck className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {isBengali ? "হল প্রশাসন প্যানেল" : "Hall Admin Portal"}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 animate-pulse" />
                  {isBengali ? "লাইভ অডিট" : "Live Realtime Sync"}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-100 font-bengali mt-0.5">
                {isBengali ? "শিক্ষার্থী প্রোফাইল যাচাই ও অনুমোদন" : "Student Profile Approval Queue"}
              </h1>
            </div>
          </div>

          {/* Controls: Refresh, Language & Navigation */}
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={loadApprovalsQueue}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-slate-700 transition-all flex items-center space-x-1.5 text-xs font-medium"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
              <span className="hidden md:inline font-bengali">
                {isBengali ? "রিফ্রেশ" : "Refresh"}
              </span>
            </button>

            <LanguageToggle />
          </div>
        </header>

        {/* Section 1: Quick Analytics Bar */}
        <section aria-label="Analytics Summary" className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Total Pending Card */}
          <div className="glass-card p-4 border-l-4 border-l-amber-500 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400 font-bengali">
                {isBengali ? "অনুমোদন অপেক্ষমাণ" : "Pending Approvals"}
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold font-mono text-amber-300">
                  {isBengali ? toBengaliDigits(stats.pendingApprovals) : stats.pendingApprovals}
                </span>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Approved This Month Card */}
          <div className="glass-card p-4 border-l-4 border-l-emerald-500 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400 font-bengali">
                {isBengali ? "চলতি মাসে অনুমোদিত" : "Approved This Month"}
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  {isBengali ? toBengaliDigits(stats.approvedThisMonth) : stats.approvedThisMonth}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Total Registered Students Card */}
          <div className="glass-card p-4 border-l-4 border-l-sky-500 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400 font-bengali">
                {isBengali ? "মোট নিবন্ধিত শিক্ষার্থী" : "Total Registered Students"}
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-2xl font-bold font-mono text-sky-300">
                  {isBengali ? toBengaliDigits(stats.totalRegistered) : stats.totalRegistered}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* Section 2: Real-time Filters & Fast Search */}
        <section aria-label="Filters" className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
          {/* Hall Tabs */}
          <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs font-medium">
            <button
              type="button"
              onClick={() => setSelectedHall("all")}
              className={`px-3 py-1.5 rounded-lg transition-all font-bengali ${
                selectedHall === "all"
                  ? "bg-slate-800 text-slate-100 font-semibold shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {isBengali ? "সকল হল" : "All Halls"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedHall("male")}
              className={`px-3 py-1.5 rounded-lg transition-all font-bengali flex items-center space-x-1 ${
                selectedHall === "male"
                  ? "bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>{t.common.maleHall}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedHall("female")}
              className={`px-3 py-1.5 rounded-lg transition-all font-bengali flex items-center space-x-1 ${
                selectedHall === "female"
                  ? "bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-950"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>{t.common.femaleHall}</span>
            </button>
          </div>

          {/* Search Bar & Select All Controller */}
          <div className="flex items-center space-x-2.5 flex-1 md:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isBengali
                    ? "আইডি, নাম, বা রুম দিয়ে অনুসন্ধান..."
                    : "Search by Student ID, Name, or Room..."
                }
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-sans"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Select All Checkbox Button */}
            {filteredStudents.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition-colors whitespace-nowrap"
              >
                {selectedIds.length === filteredStudents.length ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span className="font-bengali">
                  {selectedIds.length === filteredStudents.length
                    ? isBengali
                      ? "আনসিলেক্ট"
                      : "Deselect"
                    : isBengali
                    ? "সব নির্বাচন"
                    : "Select All"}
                </span>
              </button>
            )}
          </div>
        </section>

        {/* Section 3: Floating / Sticky Bulk Action Bar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="sticky top-4 z-30 p-3.5 rounded-2xl bg-slate-900/95 border border-emerald-500/40 backdrop-blur-xl shadow-2xl flex items-center justify-between"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">
                  {selectedIds.length}
                </div>
                <span className="text-xs font-semibold text-slate-200 font-bengali">
                  {isBengali
                    ? `${toBengaliDigits(selectedIds.length)} জন শিক্ষার্থী নির্বাচিত`
                    : `${selectedIds.length} student(s) selected for bulk verification`}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs font-medium font-bengali"
                >
                  {isBengali ? "বাতিল" : "Cancel"}
                </button>

                <button
                  type="button"
                  onClick={handleBulkApprove}
                  disabled={isBulkProcessing}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition-all shadow-emerald-glow flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isBulkProcessing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span className="font-bengali">
                    {isBengali
                      ? `একযোগে অনুমোদন করুন (${toBengaliDigits(selectedIds.length)})`
                      : `Bulk Approve (${selectedIds.length})`}
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Section 4: Approvals Review Grid / Queue */}
        <section aria-label="Approvals Queue" className="space-y-4">
          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-7 h-7 text-emerald-500 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-bengali">
                {isBengali ? "অপেক্ষমাণ তালিকা লোড হচ্ছে..." : "Loading pending verification queue..."}
              </p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-20 text-center space-y-3 glass-card p-8">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-200 font-bengali">
                {isBengali ? "কোনো আবেদন অপেক্ষমাণ নেই" : "No Pending Approvals"}
              </h3>
              <p className="text-xs text-slate-400 font-bengali max-w-sm mx-auto">
                {searchQuery || selectedHall !== "all"
                  ? isBengali
                    ? "অনুসন্ধানের শর্ত অনুযায়ী কোনো শিক্ষার্থী পাওয়া যায়নি।"
                    : "No students match your active filter criteria."
                  : isBengali
                  ? "সকল শিক্ষার্থীর প্রোফাইল অনুমোদিত ও হালনাগাদ রয়েছে।"
                  : "All submitted student profiles have been verified."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AnimatePresence>
                {filteredStudents.map((student) => {
                  const isSelected = selectedIds.includes(student.id);
                  const isProcessing = actionInProgressId === student.id;

                  return (
                    <motion.div
                      key={student.id}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className={`glass-card p-4 border transition-all duration-200 relative ${
                        isSelected
                          ? "border-emerald-500/80 bg-slate-900/90 shadow-emerald-glow"
                          : "border-slate-800 hover:border-slate-700/80"
                      }`}
                    >
                      {/* Selection Checkbox (Top Left) */}
                      <button
                        type="button"
                        onClick={() => handleToggleSelectOne(student.id)}
                        className="absolute top-3.5 left-3.5 z-10 text-slate-400 hover:text-emerald-400 transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </button>

                      {/* Card Content Layout */}
                      <div className="flex gap-3.5 pl-6">
                        {/* Prominent Passport Photo Frame with Zoom Overlay */}
                        <div className="flex flex-col items-center space-y-1.5 flex-shrink-0">
                          <div
                            onClick={() =>
                              student.profile_photo_url &&
                              setZoomedPhoto({
                                url: student.profile_photo_url,
                                name: student.full_name,
                                id: student.student_id,
                              })
                            }
                            className="relative w-20 h-24 rounded-xl overflow-hidden bg-slate-950 border-2 border-emerald-500/40 shadow-md group cursor-pointer"
                            title="Click to inspect face match"
                          >
                            {student.profile_photo_url ? (
                              <Image
                                src={student.profile_photo_url}
                                alt={student.full_name}
                                fill
                                sizes="80px"
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 text-[10px]">
                                <Users className="w-6 h-6 mb-1" />
                                <span>No Photo</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn className="w-4 h-4 text-emerald-400" />
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {isBengali ? "ছবি বড় করুন" : "Click to Zoom"}
                          </span>
                        </div>

                        {/* Student Details Column */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <h3 className="text-sm font-bold text-slate-100 truncate font-bengali">
                                {student.full_name}
                              </h3>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                  student.hall === "male"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                    : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                                }`}
                              >
                                {student.hall === "male"
                                  ? isBengali
                                    ? "ছাত্র হল"
                                    : "Male Hall"
                                  : isBengali
                                  ? "ছাত্রী হল"
                                  : "Female Hall"}
                              </span>
                            </div>

                            <p className="text-xs font-mono font-semibold text-emerald-400">
                              ID: {student.student_id}
                            </p>
                          </div>

                          {/* Data Badges Grid */}
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-300">
                            <div className="flex items-center space-x-1.5 truncate">
                              <DoorClosed className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span>
                                {isBengali ? "রুম নং: " : "Room: "}
                                <span className="font-semibold text-slate-200">
                                  {student.room_number}
                                </span>
                              </span>
                            </div>

                            <div className="flex items-center space-x-1.5 truncate">
                              <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span className="font-mono text-slate-300">
                                {student.phone_number}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1.5 truncate col-span-2">
                              <GraduationCap className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate" title={student.department}>
                                {student.department || "General"}
                              </span>
                            </div>

                            <div className="flex items-center space-x-3 text-[10px] text-slate-400 col-span-2 pt-0.5">
                              {student.blood_group && (
                                <span className="inline-flex items-center text-rose-400">
                                  <Droplet className="w-3 h-3 mr-0.5" />
                                  {student.blood_group}
                                </span>
                              )}
                              {student.session && (
                                <span className="font-mono">
                                  Session: {student.session}
                                </span>
                              )}
                              <span className="ml-auto text-[10px] text-slate-400">
                                {formatDate(student.created_at)}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons Row */}
                          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800/80">
                            {/* Reject Button (Red Outline) */}
                            <button
                              type="button"
                              onClick={() => {
                                setRejectDialogTarget(student);
                                setRejectionReason("");
                              }}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-all font-bengali flex items-center space-x-1 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isBengali ? "বাতিল করুন" : "Reject"}</span>
                            </button>

                            {/* Approve Button (Green) */}
                            <button
                              type="button"
                              onClick={() => handleApprove(student)}
                              disabled={isProcessing}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition-all shadow-emerald-glow flex items-center space-x-1.5 font-bengali disabled:opacity-50"
                            >
                              {isProcessing ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                              )}
                              <span>{isBengali ? "অনুমোদন করুন" : "Approve"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>
      </div>

      {/* Modal 1: Photo Zoom Face Inspection */}
      <AnimatePresence>
        {zoomedPhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-sm w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-slate-100 font-bengali">
                    {zoomedPhoto.name}
                  </h4>
                  <p className="text-[10px] font-mono text-emerald-400">
                    ID: {zoomedPhoto.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setZoomedPhoto(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* High-Resolution Photo Container */}
              <div className="relative w-full h-80 rounded-xl overflow-hidden bg-black border border-emerald-500/30">
                <Image
                  src={zoomedPhoto.url}
                  alt={zoomedPhoto.name}
                  fill
                  sizes="320px"
                  className="object-contain"
                />
              </div>

              <p className="text-[11px] text-slate-400 text-center font-bengali">
                {isBengali
                  ? "শিক্ষার্থীর ছবি ও মুখাবয়ব হল কর্তৃপক্ষের মূল নথির সাথে মিলিয়ে নিন।"
                  : "Inspect student's official photo against registered institutional records."}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Rejection Confirmation with Reason */}
      <AnimatePresence>
        {rejectDialogTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center space-x-2.5 text-rose-400 pb-2 border-b border-slate-800">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <h3 className="text-sm font-bold font-bengali">
                  {isBengali ? "নিবন্ধন আবেদন বাতিল নিশ্চিতকরণ" : "Confirm Registration Rejection"}
                </h3>
              </div>

              <div className="text-xs text-slate-300 font-bengali space-y-1">
                <p>
                  {isBengali
                    ? `আপনি কি নিশ্চিতভাবে ${rejectDialogTarget.full_name} (আইডি: ${rejectDialogTarget.student_id})-এর আবেদন বাতিল করতে চান?`
                    : `Are you sure you want to reject the application for ${rejectDialogTarget.full_name} (ID: ${rejectDialogTarget.student_id})?`}
                </p>
                <p className="text-[11px] text-slate-400">
                  {isBengali
                    ? "বাতিলের কারণটি অ্যাডমিন অডিট লগে সংরক্ষণ করা হবে।"
                    : "The rejection reason will be permanently recorded in the admin audit log."}
                </p>
              </div>

              {/* Preset Reason Tags */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 font-bengali">
                  {isBengali ? "দ্রুত কারণ নির্বাচন করুন:" : "Quick reason presets:"}
                </span>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {[
                    isBengali ? "রুম নং অমিল" : "Room record mismatch",
                    isBengali ? "ভুল স্টুডেন্ট আইডি" : "Invalid student ID",
                    isBengali ? "অস্পষ্ট ছবি" : "Unclear passport photo",
                    isBengali ? "হল রেকর্ড অনুপস্থিত" : "Not listed in hall registry",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionReason(preset)}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-bengali transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason Text Area */}
              <div>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={
                    isBengali
                      ? "বাতিলের কারণ বিস্তারিত লিখুন..."
                      : "Enter specific reason for rejection..."
                  }
                  className="w-full p-2.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/50 font-sans"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectDialogTarget(null)}
                  disabled={isRejecting}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs font-medium font-bengali"
                >
                  {isBengali ? "ফিরে যান" : "Cancel"}
                </button>

                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={isRejecting}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-crimson-glow flex items-center space-x-1.5 font-bengali disabled:opacity-50"
                >
                  {isRejecting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>{isBengali ? "বাতিল নিশ্চিত করুন" : "Confirm Rejection"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
