"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Clock, 
  Building2, 
  DoorClosed, 
  IdCard, 
  User, 
  RefreshCw, 
  LogOut, 
  ShieldAlert, 
  CheckCircle2, 
  HelpCircle,
  Sparkles,
  GraduationCap,
  Droplet,
  Calendar
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { supabase } from "@/lib/supabase/client";

interface StudentPendingInfo {
  id?: string;
  student_id: string;
  full_name: string;
  department?: string;
  blood_group?: string;
  session?: string;
  hall: "male" | "female";
  room_number: string;
  profile_photo_url: string | null;
  email?: string;
  phone_number?: string;
  is_approved?: boolean;
}

export default function PendingApprovalPage() {
  const router = useRouter();
  const { t, isBengali } = useTranslation();

  const [student, setStudent] = useState<StudentPendingInfo>(() => {
    if (typeof window !== "undefined") {
      const cached = sessionStorage.getItem("bup_pending_student");
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore parsing error
        }
      }
    }
    return {
      student_id: "",
      full_name: "",
      hall: "male",
      room_number: "",
      profile_photo_url: null,
    };
  });

  const [isApproved, setIsApproved] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  /**
   * Action when approval is detected
   */
  const handleApproved = useCallback(() => {
    setIsApproved(true);
    setTimeout(() => {
      router.push("/student/dashboard");
    }, 1500);
  }, [router]);

  /**
   * Check approval status from database via /api/auth/me (bypasses RLS)
   */
  const checkApprovalStatus = useCallback(async (uid?: string) => {
    const targetId = uid || userId || student.id;
    const targetPhone = student.phone_number;
    const targetSid = student.student_id;

    let queryParam = "";
    if (targetId) queryParam = `userId=${encodeURIComponent(targetId)}`;
    else if (targetPhone) queryParam = `phone=${encodeURIComponent(targetPhone)}`;
    else if (targetSid) queryParam = `studentId=${encodeURIComponent(targetSid)}`;

    if (!queryParam) return;

    try {
      const res = await fetch(`/api/auth/me?${queryParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setStudent({
            id: data.profile.id,
            student_id: data.profile.student_id,
            full_name: data.profile.full_name,
            department: data.profile.department,
            blood_group: data.profile.blood_group,
            session: data.profile.session,
            hall: data.profile.hall || "male",
            room_number: data.profile.room_number,
            profile_photo_url: data.profile.profile_photo_url,
            email: data.profile.email,
            phone_number: data.profile.phone_number,
            is_approved: data.profile.is_approved,
          });

          if (data.profile.is_approved || data.isApproved) {
            handleApproved();
          }
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [userId, student.id, student.phone_number, student.student_id, handleApproved]);

  /**
   * Hall Authority Manual Verification Action
   */
  const handleHallAuthorityApprove = async () => {
    setIsApproving(true);
    try {
      const res = await fetch("/api/auth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: student.id || userId || undefined,
          studentId: student.student_id || undefined,
          phone: student.phone_number || undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.isApproved) {
        handleApproved();
      }
    } catch (err) {
      console.error("[Pending] Manual approval error:", err);
    } finally {
      setIsApproving(false);
    }
  };

  /**
   * Initialize student data from Supabase session or cache, and setup Realtime listener + Polling
   */
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    async function initPendingState() {
      // 1. Read stored session cache if freshly redirected from onboarding
      if (typeof window !== "undefined") {
        const cached = sessionStorage.getItem("bup_pending_student");
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setStudent((prev) => ({ ...prev, ...parsed }));
          } catch {
            // Ignore parse errors
          }
        }
      }

      // 2. Fetch authenticated Supabase user
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const activeUserId = session?.user?.id;

        if (activeUserId) {
          setUserId(activeUserId);
          await checkApprovalStatus(activeUserId);

          // 3. Supabase Realtime Listener for instant redirect on approval
          channel = supabase
            .channel(`public:users:id=eq.${activeUserId}`)
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "users",
                filter: `id=eq.${activeUserId}`,
              },
              (payload) => {
                if (payload.new && (payload.new as { is_approved: boolean }).is_approved) {
                  handleApproved();
                }
              }
            )
            .subscribe();
        } else {
          // Run initial check for non-session user (phone or preview)
          await checkApprovalStatus();
        }
      } catch (err) {
        console.warn("[Pending] Error initializing session listener:", err);
      }

      // 4. Polling fallback every 6 seconds across all authentication types
      pollInterval = setInterval(() => {
        checkApprovalStatus();
      }, 6000);
    }

    initPendingState();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [checkApprovalStatus, handleApproved]);

  /**
   * Manual refresh trigger
   */
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await checkApprovalStatus();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  /**
   * Sign out handler
   */
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("bup_pending_student");
      }
      router.push("/auth/login");
    } catch {
      router.push("/auth/login");
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-slate-100 flex flex-col items-center justify-center px-4 py-8 relative">
      {/* Background Warm Amber Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header with Institutional Branding & Language Switcher */}
      <header className="w-full max-w-md flex items-center justify-between mb-8 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-amber-glow">
            <Clock className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <span className="text-[10px] tracking-wider uppercase font-semibold text-amber-400 block font-mono">
              Hall Administration
            </span>
            <span className="text-sm font-bold text-slate-100 font-bengali">
              {t.common.appName}
            </span>
          </div>
        </div>

        {/* Bilingual Language Switcher ("বাংলা | English") */}
        <LanguageToggle />
      </header>

      {/* Main Glass Card Container */}
      <main className="w-full max-w-md z-10">
        <div className="glass-card p-6 sm:p-8 border border-slate-800/80 shadow-2xl relative space-y-6 text-center">
          {/* Approved State Banner */}
          {isApproved ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/50 shadow-emerald-glow text-center space-y-2"
            >
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h2 className="text-base font-bold text-emerald-300 font-bengali">
                {t.auth.approvedRedirecting}
              </h2>
            </motion.div>
          ) : (
            <>
              {/* Warm Amber Pulse Status Badge */}
              <div className="flex justify-center">
                <div className="relative inline-flex items-center px-4 py-2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold font-bengali text-xs shadow-amber-glow">
                  {/* Animated warm amber pulse dot */}
                  <span className="relative flex h-2.5 w-2.5 mr-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                  <span>{t.auth.pendingStatusBadge}</span>
                </div>
              </div>

              {/* Student Identification Profile Card */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                {/* Uploaded Passport Photo */}
                <div className="relative w-24 h-24 mx-auto rounded-full overflow-hidden border-2 border-amber-500/50 shadow-lg bg-slate-900 flex items-center justify-center">
                  {student.profile_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={student.profile_photo_url}
                      alt={student.full_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-slate-500" />
                  )}
                </div>

                {/* Name & ID */}
                <div>
                  <h2 className="text-base font-bold text-slate-100 font-bengali">
                    {student.full_name || (isBengali ? "তথ্য লোড হচ্ছে..." : "Loading details...")}
                  </h2>
                  <p className="text-xs font-mono text-emerald-400 mt-0.5">
                    {student.student_id ? `ID: ${student.student_id}` : (isBengali ? "আইডি লোড হচ্ছে" : "Loading ID")}
                  </p>
                </div>

                {/* Academic & Resident Info Grid */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-left text-xs">
                  {/* Department */}
                  <div className="flex items-center space-x-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <GraduationCap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="truncate">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Dept</span>
                      <span className="text-xs text-slate-300 font-sans truncate block">
                        {student.department || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Session */}
                  <div className="flex items-center space-x-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <Calendar className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Session</span>
                      <span className="text-xs font-mono text-slate-300 block">
                        {student.session || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Hall */}
                  <div className="flex items-center space-x-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="truncate">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Hall</span>
                      <span className="text-xs text-slate-300 font-bengali truncate block">
                        {student.hall === "male" ? t.common.maleHall : t.common.femaleHall}
                      </span>
                    </div>
                  </div>

                  {/* Room & Blood Group */}
                  <div className="flex items-center space-x-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <DoorClosed className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 truncate">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">Room / Blood</span>
                      <span className="text-xs font-mono text-slate-200 block truncate">
                        {student.room_number || "—"} {student.blood_group ? `• ${student.blood_group}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Institutional Notice Card strictly explaining manual verification */}
              <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-left flex items-start space-x-3">
                <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90 leading-relaxed font-bengali">
                  {t.auth.manualVerificationReason}
                </p>
              </div>

              {/* Hall Authority Manual Verification Action (For Provost / Admin Verification) */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/30 space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-200 font-bengali">
                      {isBengali ? "হল কর্তৃপক্ষ ম্যানুয়াল যাচাইকরণ" : "Hall Authority Manual Verification"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Provost
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-bengali leading-relaxed">
                  {isBengali
                    ? "যেহেতু শিক্ষার্থী প্রাতিষ্ঠানিক ইমেইল ছাড়া আবেদন করেছেন, হল প্রভোস্ট বা কাউন্টার প্রশাসন এই বাটনটি দিয়ে অ্যাকাউন্ট অনুমোদন ও সক্রিয় করতে পারেন।"
                    : "As the student registered without an edu email, Hall Provost or Administration can manually approve and activate the account."}
                </p>
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={handleHallAuthorityApprove}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs font-bengali transition-colors flex items-center justify-center space-x-2 shadow-amber-glow disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isApproving 
                      ? (isBengali ? "অনুমোদন করা হচ্ছে..." : "Approving...")
                      : (isBengali ? "হলের ম্যানুয়াল অনুমোদন দিন (Approve Account)" : "Approve Student Account")}
                  </span>
                </button>
              </div>

              {/* Realtime Status Polling Indicator & Manual Refresh */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-400 font-bengali text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{t.auth.autoChecking}</span>
                </div>

                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center space-x-1 text-slate-300 hover:text-emerald-400 font-bengali transition-colors text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-400" : ""}`} />
                  <span>{t.auth.refreshStatus}</span>
                </button>
              </div>

              {/* Hall Provost Office Assistance Note */}
              <div className="pt-2 text-[11px] text-slate-400 font-bengali flex items-center justify-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>{t.auth.provostHelp}</span>
              </div>

              {/* Sign Out Secondary Action */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors flex items-center justify-center space-x-2 font-bengali"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.auth.signOut}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-slate-400 z-10">
        <p className="font-bengali">{t.common.bupTitle}</p>
        <p className="text-[11px] text-slate-400 font-mono mt-0.5">BUP Hall Dining System • v1.0.0</p>
      </footer>
    </div>
  );
}
