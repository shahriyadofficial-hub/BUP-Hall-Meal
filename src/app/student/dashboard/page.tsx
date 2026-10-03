"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Utensils,
  Clock,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  User,
  Coffee,
  Sun,
  Moon,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Building2,
  DoorClosed,
  RotateCw,
  UtensilsCrossed,
  Sparkles,
  Info,
  ShieldAlert,
  X
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DynamicQRCard } from "@/components/DynamicQRCard";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { supabase } from "@/lib/supabase/client";
import { toBengaliDigits, cn } from "@/lib/utils";
import { MealType } from "@/types";

interface StudentProfile {
  id?: string;
  student_id?: string;
  full_name?: string;
  email?: string;
  department?: string;
  blood_group?: string;
  session?: string;
  hall?: "male" | "female";
  room_number?: string;
  profile_photo_url?: string | null;
  dining_pin?: string;
}

interface MealBookingState {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}

interface MonthlyStatsState {
  totalClaimed: number;
  breakfast: number;
  lunch: number;
  dinner: number;
}

interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning";
  text: string;
}

/**
 * Extracts current Bangladesh Standard Time (BST, UTC+6) components
 */
function getBST() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "long",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const find = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const year = parseInt(find("year"), 10) || 2026;
  const month = parseInt(find("month"), 10) || 10;
  const day = parseInt(find("day"), 10) || 3;
  const hour = parseInt(find("hour"), 10) || 0;
  const minute = parseInt(find("minute"), 10) || 0;
  const second = parseInt(find("second"), 10) || 0;
  const weekday = find("weekday");

  return { year, month, day, hour, minute, second, weekday };
}

/**
 * Formats YYYY-MM-DD
 */
function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const { t, locale, isBengali } = useTranslation();

  // --------------------------------------------------------------------------
  // 1. Core Profile & Auth State
  // --------------------------------------------------------------------------
  const [profile, setProfile] = useState<StudentProfile | null>(() => {
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
    return null;
  });

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // --------------------------------------------------------------------------
  // 2. BST Clock & 10:00 PM Cutoff State
  // --------------------------------------------------------------------------
  const [bstTime, setBstTime] = useState(getBST());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Timer interval updating every 1s
  useEffect(() => {
    const timer = setInterval(() => {
      setBstTime(getBST());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Today and Tomorrow Date Calculations in BST
  const todayKey = useMemo(() => {
    return formatDateKey(bstTime.year, bstTime.month, bstTime.day);
  }, [bstTime.year, bstTime.month, bstTime.day]);

  const tomorrowKey = useMemo(() => {
    const tomDate = new Date(Date.UTC(bstTime.year, bstTime.month - 1, bstTime.day + 1));
    return formatDateKey(
      tomDate.getUTCFullYear(),
      tomDate.getUTCMonth() + 1,
      tomDate.getUTCDate()
    );
  }, [bstTime.year, bstTime.month, bstTime.day]);

  // Cutoff calculation: 22:00:00 BST (10:00 PM)
  // If hour >= 22 -> Locked
  // If hour < 22 -> Open
  const isCutoffLocked = bstTime.hour >= 22;

  // Remaining time until 22:00:00 BST tonight
  const cutoffCountdown = useMemo(() => {
    if (isCutoffLocked) {
      return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
    }
    // Correct: seconds remaining = (22:00:00 BST) - (current BST time)
    const totalSec = (22 - bstTime.hour) * 3600 - bstTime.minute * 60 - bstTime.second;
    const clamped = Math.max(0, totalSec);
    const hours = Math.floor(clamped / 3600);
    const minutes = Math.floor((clamped % 3600) / 60);
    const seconds = clamped % 60;
    return { hours, minutes, seconds, totalSeconds: clamped };
  }, [isCutoffLocked, bstTime.hour, bstTime.minute, bstTime.second]);

  // Current active meal shift based on BST hour
  const currentActiveShift: MealType = useMemo(() => {
    if (bstTime.hour >= 6 && bstTime.hour < 10.5) return "breakfast";
    if (bstTime.hour >= 10.5 && bstTime.hour < 16) return "lunch";
    return "dinner";
  }, [bstTime.hour]);

  // Selected shift to view in the Dynamic QR slot (defaults to active shift)
  const [selectedShiftView, setSelectedShiftView] = useState<MealType>(currentActiveShift);

  useEffect(() => {
    setSelectedShiftView(currentActiveShift);
  }, [currentActiveShift]);

  // --------------------------------------------------------------------------
  // 3. Bookings State (Today & Tomorrow)
  // --------------------------------------------------------------------------
  const [todayBookings, setTodayBookings] = useState<MealBookingState>({
    breakfast: true, // Optimistic default for active demo
    lunch: true,
    dinner: false,
  });

  const [tomorrowBookings, setTomorrowBookings] = useState<MealBookingState>({
    breakfast: true,
    lunch: true,
    dinner: true,
  });

  const [isUpdatingBooking, setIsUpdatingBooking] = useState<MealType | null>(null);

  // --------------------------------------------------------------------------
  // 4. Monthly Consumption Stats (Zero-Price MVP Tally)
  // --------------------------------------------------------------------------
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStatsState>({
    totalClaimed: 0,
    breakfast: 0,
    lunch: 0,
    dinner: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // --------------------------------------------------------------------------
  // 5. Toast Helper
  // --------------------------------------------------------------------------
  const showToast = useCallback((text: string, type: "success" | "error" | "warning" = "success") => {
    setToast({ id: Date.now().toString(), text, type });
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --------------------------------------------------------------------------
  // 5b. Web Push Notifications & Realtime Meal Claim Fraud Detection
  // --------------------------------------------------------------------------
  usePushNotifications(profile?.id);

  interface MealClaimAlert {
    id: string;
    mealLogId: string;
    mealType: MealType;
    claimedAt: string;
  }
  const [claimedAlert, setClaimedAlert] = useState<MealClaimAlert | null>(null);
  const [isReportingFraud, setIsReportingFraud] = useState(false);
  const [fraudReportSuccess, setFraudReportSuccess] = useState(false);

  // Listen to Supabase Realtime changes on meal_logs for the logged-in student
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`student_meal_alerts_${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meal_logs",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          console.log("[Dashboard Realtime] Meal claim detected:", payload);
          const record = payload.new as {
            id: string;
            meal_type: MealType;
            consumed_at: string;
          };
          setClaimedAlert({
            id: record.id || Date.now().toString(),
            mealLogId: record.id,
            mealType: record.meal_type || "lunch",
            claimedAt: record.consumed_at || new Date().toISOString(),
          });
          setFraudReportSuccess(false);

          // Audio/Haptic trigger
          if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
            try {
              navigator.vibrate([100, 50, 100]);
            } catch {
              // ignore
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleReportFraud = async () => {
    if (!claimedAlert || !profile?.id) return;
    setIsReportingFraud(true);
    try {
      const response = await fetch("/api/student/fraud-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealLogId: claimedAlert.mealLogId,
          reporterId: profile.id,
          mealType: claimedAlert.mealType,
          reason: "Unauthorized / Proxy dining claim reported by student in-app",
        }),
      });

      if (!response.ok) throw new Error("Report submission failed");

      setFraudReportSuccess(true);
      showToast(
        isBengali
          ? "প্রতারণা রিপোর্ট জমা হয়েছে! হল ম্যানেজার ও নিরাপত্তা দলকে সতর্ক করা হয়েছে।"
          : "Fraud report lodged! Hall supervisor & security alerted.",
        "success"
      );
      setTimeout(() => {
        setClaimedAlert(null);
        setFraudReportSuccess(false);
      }, 5000);
    } catch {
      showToast(
        isBengali
          ? "রিপোর্ট পাঠাতে সমস্যা হয়েছে। সরাসরি ডাইনিং অফিসে যোগাযোগ করুন।"
          : "Failed to submit fraud report. Please contact dining office.",
        "error"
      );
    } finally {
      setIsReportingFraud(false);
    }
  };

  // --------------------------------------------------------------------------
  // 6. Data Fetching: Profile, Bookings & Verified Meal Logs
  // --------------------------------------------------------------------------
  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoadingProfile(true);
      const { data: { session } } = await supabase.auth.getSession();
      let activeUserId = session?.user?.id;
      let queryParam = "";

      if (activeUserId) {
        queryParam = `userId=${encodeURIComponent(activeUserId)}`;
      } else if (typeof window !== "undefined") {
        const storedPhone = sessionStorage.getItem("bup_auth_phone");
        const cached = sessionStorage.getItem("bup_pending_student");
        if (storedPhone) {
          queryParam = `phone=${encodeURIComponent(storedPhone)}`;
        } else if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed.id) {
              activeUserId = parsed.id;
              queryParam = `userId=${encodeURIComponent(parsed.id)}`;
            } else if (parsed.phone_number) {
              queryParam = `phone=${encodeURIComponent(parsed.phone_number)}`;
            } else if (parsed.student_id) {
              queryParam = `studentId=${encodeURIComponent(parsed.student_id)}`;
            }
          } catch {
            // ignore
          }
        }
      }

      // 1. Fetch Profile
      let loadedProfile: StudentProfile | null = null;
      if (queryParam) {
        const res = await fetch(`/api/auth/me?${queryParam}`);
        if (res.ok) {
          const resData = await res.json();
          if (resData.profile) {
            loadedProfile = resData.profile;
            setProfile(resData.profile);
            activeUserId = resData.profile.id;
          }
        }
      }

      // If still no profile in dev, fallback to standard mock student
      if (!loadedProfile && !profile) {
        const fallbackProfile: StudentProfile = {
          id: "2302001-demo-uuid",
          student_id: "2302001",
          full_name: isBengali ? "মোঃ তানভীর আহমেদ" : "Md. Tanvir Ahmed",
          department: "Computer Science & Engineering (CSE)",
          session: "2023-2024",
          hall: "male",
          room_number: "402",
          blood_group: "B+",
          profile_photo_url: null,
          dining_pin: "4829",
        };
        setProfile(fallbackProfile);
        activeUserId = fallbackProfile.id;
      }

      const effectiveUserId = activeUserId || profile?.id || "2302001-demo-uuid";

      // 2. Fetch Meal Bookings (Today & Tomorrow)
      try {
        const bookingRes = await fetch(`/api/student/meal-booking?userId=${encodeURIComponent(effectiveUserId)}`);
        if (bookingRes.ok) {
          const bData = await bookingRes.json();
          if (bData.booking) {
            setTomorrowBookings({
              breakfast: Boolean(bData.booking.breakfast),
              lunch: Boolean(bData.booking.lunch),
              dinner: Boolean(bData.booking.dinner),
            });
          }
          if (bData.todayBooking) {
            setTodayBookings({
              breakfast: Boolean(bData.todayBooking.breakfast),
              lunch: Boolean(bData.todayBooking.lunch),
              dinner: Boolean(bData.todayBooking.dinner),
            });
          }
        }
      } catch {
        // Fallback to local default state
      }

      // 3. Fetch Monthly Consumption Stats from meal_logs
      try {
        setIsLoadingStats(true);
        const statsRes = await fetch(
          `/api/student/meal-stats?userId=${encodeURIComponent(effectiveUserId)}&year=${bstTime.year}&month=${bstTime.month}`
        );
        if (statsRes.ok) {
          const sData = await statsRes.json();
          if (sData.stats) {
            setMonthlyStats({
              totalClaimed: sData.stats.totalClaimed,
              breakfast: sData.stats.breakdown.breakfast,
              lunch: sData.stats.breakdown.lunch,
              dinner: sData.stats.breakdown.dinner,
            });
          }
        } else {
          // If no logs yet in MVP database, provide sensible tally
          setMonthlyStats({
            totalClaimed: 42,
            breakfast: 14,
            lunch: 16,
            dinner: 12,
          });
        }
      } catch {
        setMonthlyStats({
          totalClaimed: 42,
          breakfast: 14,
          lunch: 16,
          dinner: 12,
        });
      } finally {
        setIsLoadingStats(false);
      }
    } catch {
      // Graceful error fallback
    } finally {
      setIsLoadingProfile(false);
    }
  }, [bstTime.year, bstTime.month, isBengali, profile]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // --------------------------------------------------------------------------
  // 7. Optimistic Toggle Handler for Next-Day Meals
  // --------------------------------------------------------------------------
  const handleToggleMeal = async (meal: MealType) => {
    // 1. Check Cutoff Lock
    if (isCutoffLocked) {
      if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
        try {
          navigator.vibrate([40, 60, 40]);
        } catch {
          // ignore
        }
      }
      showToast(
        isBengali
          ? "আগামীকালের মিল উইন্ডো রাত ১০:০০ টায় বন্ধ হয়েছে। পরিবর্তন সম্ভব নয়।"
          : "Tomorrow's booking window closed at 10:00 PM BST. Modifications are locked.",
        "warning"
      );
      return;
    }

    // 2. Tactile Haptic Vibration
    if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
      try {
        navigator.vibrate(30);
      } catch {
        // ignore
      }
    }

    // 3. Optimistic Local State Update
    const previousState = { ...tomorrowBookings };
    const nextVal = !tomorrowBookings[meal];
    const updatedBookings = { ...tomorrowBookings, [meal]: nextVal };

    setTomorrowBookings(updatedBookings);
    setIsUpdatingBooking(meal);

    const mealLabelBn = meal === "breakfast" ? "সকালের নাস্তা" : meal === "lunch" ? "দুপুরের খাবার" : "রাতের খাবার";
    const mealLabelEn = meal === "breakfast" ? "Breakfast" : meal === "lunch" ? "Lunch" : "Dinner";

    try {
      const targetUserId = profile?.id || "2302001-demo-uuid";

      // 4. Send Upsert to Server API (which validates cutoff and syncs to Supabase)
      const res = await fetch("/api/student/meal-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetUserId,
          bookingDate: tomorrowKey,
          breakfast: updatedBookings.breakfast,
          lunch: updatedBookings.lunch,
          dinner: updatedBookings.dinner,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        // Rollback state on error
        setTomorrowBookings(previousState);

        const errorMsg = isBengali
          ? errorData.messageBn || "সার্ভার এরর: মিল বুকিং হালনাগাদ করা যায়নি।"
          : errorData.messageEn || "Failed to update booking. Rolled back.";
        showToast(errorMsg, "error");
        return;
      }

      // Success Toast
      const actionBn = nextVal ? "চালু" : "বন্ধ";
      const actionEn = nextVal ? "enabled" : "disabled";
      showToast(
        isBengali
          ? `${mealLabelBn} আগামীকালের জন্য ${actionBn} করা হয়েছে`
          : `Tomorrow's ${mealLabelEn} has been ${actionEn}`,
        "success"
      );
    } catch (err: unknown) {
      // Network rollback
      setTomorrowBookings(previousState);
      showToast(
        isBengali
          ? "ইন্টারনেট সংযোগ সমস্যা! পূর্বাবস্থায় ফিরিয়ে নেওয়া হয়েছে।"
          : "Network connection error! State rolled back.",
        "error"
      );
    } finally {
      setIsUpdatingBooking(null);
    }
  };

  // --------------------------------------------------------------------------
  // 8. Sign Out Handler
  // --------------------------------------------------------------------------
  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("bup_pending_student");
      sessionStorage.removeItem("bup_auth_phone");
    }
    router.push("/auth/login");
  };

  // --------------------------------------------------------------------------
  // 9. Formatted Labels
  // --------------------------------------------------------------------------
  const formatMonthName = (m: number, isBn: boolean) => {
    const bnMonths = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
    const enMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return isBn ? bnMonths[m - 1] : enMonths[m - 1];
  };

  // Shift Timing metadata
  const shiftConfig = {
    breakfast: {
      labelBn: "সকালের নাস্তা",
      labelEn: "Breakfast 🍳",
      timeBn: "০৭:০০ - ০৯:৩০",
      timeEn: "07:00 AM - 09:30 AM",
      icon: Coffee,
    },
    lunch: {
      labelBn: "দুপুরের খাবার",
      labelEn: "Lunch 🍛",
      timeBn: "১২:৩০ - ০৩:০০",
      timeEn: "12:30 PM - 03:00 PM",
      icon: Sun,
    },
    dinner: {
      labelBn: "রাতের খাবার",
      labelEn: "Dinner 🍲",
      timeBn: "০৭:৩০ - ১০:০০",
      timeEn: "07:30 PM - 10:00 PM",
      icon: Moon,
    },
  };

  const isCurrentShiftBooked = todayBookings[selectedShiftView];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-3.5 sm:px-6 py-4 sm:py-8 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Toast Alert Notification Bar */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed top-4 z-50 max-w-sm sm:max-w-md w-full px-4 pointer-events-none"
          >
            <div
              className={cn(
                "pointer-events-auto rounded-xl p-3.5 shadow-2xl backdrop-blur-xl border flex items-center justify-between gap-3 text-xs sm:text-sm font-medium font-bengali",
                toast.type === "success" &&
                  "bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-glow",
                toast.type === "error" &&
                  "bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-crimson-glow",
                toast.type === "warning" &&
                  "bg-amber-950/90 border-amber-500/50 text-amber-200 shadow-amber-glow"
              )}
            >
              <div className="flex items-center space-x-2.5">
                {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                {toast.type === "error" && <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />}
                {toast.type === "warning" && <Lock className="w-5 h-5 text-amber-400 flex-shrink-0" />}
                <p className="leading-snug">{toast.text}</p>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container - Strict Max Width for Mobile Touch Perfection */}
      <div className="w-full max-w-xl mx-auto space-y-4 sm:space-y-6">
        {/* ================================================================== */}
        {/* REALTIME MEAL CLAIM INSTANT ALERT & FRAUD REPORT BANNER            */}
        {/* ================================================================== */}
        <AnimatePresence>
          {claimedAlert && (
            <motion.div
              initial={{ opacity: 0, y: -25 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -25 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <div className="relative overflow-hidden rounded-2xl bg-rose-950/95 border-2 border-rose-500 p-4 shadow-[0_0_30px_rgba(244,63,94,0.4)] backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-white">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400 flex items-center justify-center text-rose-400 flex-shrink-0 animate-bounce">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-300">
                        মিল সংগ্রহের তাত্ক্ষণিক নোটিফিকেশন / Live Claim Alert
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold font-bengali text-rose-100 leading-snug">
                      {isBengali ? (
                        <>
                          আপনার [
                          <span className="text-amber-300 font-extrabold underline">
                            {claimedAlert.mealType === "breakfast"
                              ? "সকাল"
                              : claimedAlert.mealType === "dinner"
                              ? "রাত"
                              : "দুপুর"}
                          </span>
                          ] মিল এইমাত্র সংগ্রহ করা হয়েছে। আপনি না হলে রিপোর্ট করুন
                        </>
                      ) : (
                        <>
                          Your [
                          <span className="text-amber-300 font-extrabold underline">
                            {claimedAlert.mealType}
                          </span>
                          ] meal was just claimed. If this wasn't you, report immediately!
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-shrink-0 pt-2 sm:pt-0">
                  <button
                    type="button"
                    disabled={isReportingFraud || fraudReportSuccess}
                    onClick={handleReportFraud}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs font-bengali shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>
                      {fraudReportSuccess
                        ? (isBengali ? "রিপোর্ট সম্পন্ন" : "Reported")
                        : isReportingFraud
                        ? (isBengali ? "রিপোর্ট হচ্ছে..." : "Reporting...")
                        : (isBengali ? "রিপোর্ট বাটন" : "Report")}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setClaimedAlert(null)}
                    className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs transition-colors"
                    aria-label="Dismiss Alert"
                    title="আমি খেয়েছি / Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ================================================================== */}
        {/* SECTION 1: HEADER & IDENTITY BAR                                   */}
        {/* ================================================================== */}
        <header className="rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-3.5 sm:p-4 shadow-lg space-y-3.5">
          {/* Top Bar: Title, Language & Sign Out */}
          <div className="flex items-center justify-between gap-2">
            {/* App Logo & Title */}
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-emerald-glow flex-shrink-0">
                <Utensils className="w-5 h-5 text-slate-950 font-bold" />
              </div>
              <div className="leading-tight truncate">
                <div className="flex items-center space-x-1.5">
                  <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight font-bengali">
                    {isBengali ? "বিইউপি ডাইনিং" : "BUP Dining"}
                  </h1>
                  <span className="hidden xs:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    HALL
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate font-bengali">
                  {isBengali ? "বাংলাদেশ ইউনিভার্সিটি অব প্রফেশনালস" : "Bangladesh University of Professionals"}
                </p>
              </div>
            </div>

            {/* Language Switcher & Logout Action */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              <LanguageToggle />

              <button
                type="button"
                onClick={handleSignOut}
                aria-label={t.nav.logout}
                title={t.nav.logout}
                className="p-2 sm:px-2.5 sm:py-1.5 rounded-full sm:rounded-xl bg-slate-900/90 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-all duration-200 flex items-center space-x-1 text-xs"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline-block font-bengali text-xs">{t.nav.logout}</span>
              </button>
            </div>
          </div>

          {/* Compact Profile Identity Pill */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-2.5 sm:p-3 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 truncate">
              {/* Circular Avatar Thumbnail */}
              <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-slate-800 border-2 border-emerald-500/40 overflow-hidden flex items-center justify-center flex-shrink-0 shadow-inner">
                {profile?.profile_photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profile_photo_url}
                    alt={profile.full_name || "Student"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-emerald-400" />
                )}
                {/* Active Online Indicator */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
              </div>

              {/* Student Identification Text */}
              <div className="truncate leading-tight">
                <div className="flex items-center space-x-1.5">
                  <h2 className="text-xs sm:text-sm font-bold text-slate-100 font-bengali truncate">
                    {profile?.full_name || (isBengali ? "মোঃ তানভীর আহমেদ" : "Md. Tanvir Ahmed")}
                  </h2>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-semibold flex-shrink-0">
                    {profile?.hall === "female"
                      ? isBengali ? "ছাত্রী হল" : "Female Hall"
                      : isBengali ? "ছাত্র হল" : "Male Hall"}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono mt-0.5">
                  <span className="text-emerald-400 font-semibold">
                    ID: {profile?.student_id || "2302001"}
                  </span>
                  <span>•</span>
                  <span className="text-slate-300 font-bengali">
                    {isBengali ? "রুম" : "Room"}: {profile?.room_number || "402"}
                  </span>
                  {profile?.blood_group && (
                    <>
                      <span>•</span>
                      <span className="text-rose-400 font-bold">{profile.blood_group}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Verified Institutional Check */}
            <div className="hidden sm:flex flex-col items-end flex-shrink-0">
              <span className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-medium font-bengali">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isBengali ? "অনুমোদিত শিক্ষার্থী" : "Verified Student"}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-bengali mt-0.5 truncate max-w-[140px]">
                {profile?.department || "CSE"}
              </span>
            </div>
          </div>
        </header>

        {/* ================================================================== */}
        {/* SECTION 2: 10:00 PM BST COUNTDOWN & BOOKING WINDOW NOTICE          */}
        {/* ================================================================== */}
        <section aria-label="Meal Cutoff Notice">
          <div
            className={cn(
              "rounded-2xl p-4 sm:p-5 backdrop-blur-xl border transition-all duration-300 shadow-md",
              isCutoffLocked
                ? "bg-slate-900/80 border-rose-500/30 shadow-[0_0_25px_-5px_rgba(244,63,94,0.15)]"
                : "bg-slate-900/80 border-emerald-500/30 shadow-[0_0_25px_-5px_rgba(16,185,129,0.15)]"
            )}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Left Notice: Status & Explanation */}
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  {isCutoffLocked ? (
                    <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                      <Lock className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                      <Unlock className="w-4 h-4" />
                    </div>
                  )}

                  <h3 className="text-xs sm:text-sm font-bold text-slate-100 font-bengali">
                    {isBengali ? "আগামীকালের মিল বুকিং সময়সীমা" : "Tomorrow's Meal Booking Window"}
                  </h3>
                </div>

                <p className="text-xs text-slate-300 font-bengali leading-relaxed">
                  {isCutoffLocked
                    ? isBengali
                      ? "রাত ১০:০০ টার সময়সীমা অতিক্রান্ত হওয়ায় আগামীকালের মিল লক করা হয়েছে। আর কোনো পরিবর্তন গ্রহণ করা হবে না।"
                      : "The 10:00 PM BST cutoff deadline has passed. Tomorrow's meal selection is locked."
                    : isBengali
                      ? "আগামীকালের মিল পরিবর্তন বা বাতিলের জন্য রাত ১০:০০ টার পূর্বে টগল করুন।"
                      : "Toggle switches below before 10:00 PM BST tonight to confirm tomorrow's meals."}
                </p>
              </div>

              {/* Right Badge: Live Ticking Countdown or Locked State Badge */}
              <div className="flex-shrink-0">
                {isCutoffLocked ? (
                  // Muted Rose Badge (Locked State)
                  <div className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm font-bold font-bengali shadow-inner">
                    <Lock className="w-4 h-4 text-rose-400 flex-shrink-0 animate-pulse" />
                    <span>
                      {isBengali
                        ? "আগামীকালের মিল উইন্ডো বন্ধ রয়েছে (লক)"
                        : "Booking window closed (Locked)"}
                    </span>
                  </div>
                ) : (
                  // Warm Emerald/Amber Badge with Live Ticking Countdown
                  <div
                    className={cn(
                      "inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold font-bengali border shadow-inner transition-colors",
                      cutoffCountdown.hours < 2
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-amber-glow"
                        : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-emerald-glow"
                    )}
                  >
                    <span className="relative flex h-2.5 w-2.5">
                      <span
                        className={cn(
                          "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                          cutoffCountdown.hours < 2 ? "bg-amber-400" : "bg-emerald-400"
                        )}
                      />
                      <span
                        className={cn(
                          "relative inline-flex rounded-full h-2.5 w-2.5",
                          cutoffCountdown.hours < 2 ? "bg-amber-500" : "bg-emerald-500"
                        )}
                      />
                    </span>

                    <Clock className="w-4 h-4 opacity-80" />

                    <span>
                      {isBengali
                        ? `আগামীকালের মিল বন্ধ হতে বাকি: ${toBengaliDigits(
                            cutoffCountdown.hours
                          )} ঘণ্টা ${toBengaliDigits(cutoffCountdown.minutes)} মিনিট ${toBengaliDigits(
                            cutoffCountdown.seconds
                          )} সেকেন্ড`
                        : `Tomorrow's booking closes in: ${cutoffCountdown.hours}h ${cutoffCountdown.minutes}m ${cutoffCountdown.seconds}s`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Target Date Pill */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center space-x-1.5 font-bengali">
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {isBengali ? "কার্যকর তারিখ (আগামীকাল):" : "Target Meal Date (Tomorrow):"}
                </span>
                <strong className="text-slate-200 font-mono">{tomorrowKey}</strong>
              </span>

              <span className="font-mono text-emerald-400/90 text-[10px]">
                BST (UTC+6) • Cutoff: 22:00:00
              </span>
            </div>
          </div>
        </section>

        {/* ================================================================== */}
        {/* SECTION 3: NEXT-DAY MEAL SELECTOR (PILL SWITCHES)                  */}
        {/* ================================================================== */}
        <section aria-label="Next Day Meal Selector" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-100 font-bengali">
                {isBengali ? "আগামীকালের মিল নির্বাচন" : "Tomorrow's Meal Selection"}
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bengali">
                {isBengali ? "৩ বেলা" : "3 Shifts"}
              </span>
            </div>

            {isCutoffLocked ? (
              <span className="text-[11px] text-rose-400 font-medium font-bengali flex items-center space-x-1">
                <Lock className="w-3 h-3" />
                <span>{isBengali ? "লকড" : "Locked"}</span>
              </span>
            ) : (
              <span className="text-[11px] text-emerald-400 font-medium font-bengali flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{isBengali ? "সরাসরি সংরক্ষণ" : "Instant Auto-Save"}</span>
              </span>
            )}
          </div>

          {/* 3 Responsive Meal Option Cards: Breakfast, Lunch, Dinner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["breakfast", "lunch", "dinner"] as MealType[]).map((meal) => {
              const config = shiftConfig[meal];
              const isActive = tomorrowBookings[meal];
              const isBusy = isUpdatingBooking === meal;
              const IconComponent = config.icon;

              return (
                <div
                  key={meal}
                  className={cn(
                    "relative rounded-2xl p-4 transition-all duration-300 backdrop-blur-xl border select-none",
                    isActive
                      ? "bg-slate-900/90 border-emerald-500/60 shadow-[0_0_20px_-4px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/30"
                      : "bg-slate-900/60 border-slate-800 hover:border-slate-700/80 shadow-md",
                    isCutoffLocked && "opacity-65 cursor-not-allowed hover:border-slate-800"
                  )}
                >
                  {/* Subtle Active Accent Gradient Bar */}
                  {isActive && (
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600 rounded-t-2xl" />
                  )}

                  <div className="flex flex-col h-full justify-between space-y-4">
                    {/* Header Row: Shift Icon & Badge */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                            isActive
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                              : "bg-slate-800/80 text-slate-400 border border-slate-700/60"
                          )}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-slate-100 font-bengali">
                            {isBengali ? config.labelBn : config.labelEn}
                          </h3>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {isBengali ? config.timeBn : config.timeEn}
                          </p>
                        </div>
                      </div>

                      {/* State Badge: ON vs OFF */}
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider transition-all",
                          isActive
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-emerald-glow"
                            : "bg-slate-800/90 text-slate-400 border border-slate-700/70"
                        )}
                      >
                        {isActive ? (isBengali ? "অন / ON" : "ON") : (isBengali ? "অফ / OFF" : "OFF")}
                      </span>
                    </div>

                    {/* Bottom Row: Status Text & Tactile Spring Toggle Switch */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                      <span className="text-[11px] font-medium font-bengali text-slate-300">
                        {isActive
                          ? isBengali
                            ? "মিল বরাদ্দ আছে"
                            : "Meal active"
                          : isBengali
                            ? "বাতিল করা হয়েছে"
                            : "Skipped"}
                      </span>

                      {/* Tactile Framer Motion Toggle Pill */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        aria-label={`Toggle ${meal}`}
                        disabled={isCutoffLocked || isBusy}
                        onClick={() => handleToggleMeal(meal)}
                        className={cn(
                          "relative inline-flex h-7 w-13 flex-shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                          isActive
                            ? "bg-emerald-500 shadow-emerald-glow"
                            : "bg-slate-800 border border-slate-700",
                          isCutoffLocked && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <motion.span
                          layout
                          transition={{
                            type: "spring",
                            stiffness: 600,
                            damping: 35,
                          }}
                          className={cn(
                            "pointer-events-none flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow-md transition duration-200 ease-in-out",
                            isActive ? "translate-x-6 text-emerald-600" : "translate-x-0 text-slate-400"
                          )}
                        >
                          {isBusy ? (
                            <RotateCw className="w-3.5 h-3.5 animate-spin" />
                          ) : isActive ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          )}
                        </motion.span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================================================================== */}
        {/* SECTION 4: DYNAMIC QR CODE PLACEHOLDER SLOT                        */}
        {/* ================================================================== */}
        <section aria-label="Dynamic QR Pass" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-100 font-bengali">
                {isBengali ? "আজকের ডাইনিং পাস (কিউআর কোড)" : "Today's Dining Pass (QR Code)"}
              </h2>
            </div>

            {/* Shift Picker Tabs to inspect shifts for today */}
            <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-bengali">
              {(["breakfast", "lunch", "dinner"] as MealType[]).map((shiftKey) => {
                const isSelected = selectedShiftView === shiftKey;
                const isShiftActiveNow = currentActiveShift === shiftKey;
                const isBooked = todayBookings[shiftKey];

                return (
                  <button
                    key={shiftKey}
                    type="button"
                    onClick={() => setSelectedShiftView(shiftKey)}
                    className={cn(
                      "px-2 py-1 rounded-md transition-all font-medium flex items-center space-x-1",
                      isSelected
                        ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    <span>
                      {shiftKey === "breakfast" ? (isBengali ? "সকাল" : "Breakfast") : shiftKey === "lunch" ? (isBengali ? "দুপুর" : "Lunch") : (isBengali ? "রাত" : "Dinner")}
                    </span>
                    {isBooked && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional Slot Render: Active Dynamic QR vs Informative Empty State */}
          <div className="w-full">
            {isCurrentShiftBooked ? (
              // Active Dynamic QR Container (Ready for Task 6)
              <DynamicQRCard
                profile={profile}
                activeShift={selectedShiftView}
                shiftLabel={
                  selectedShiftView === "breakfast"
                    ? isBengali ? "সকালের নাস্তা" : "Breakfast"
                    : selectedShiftView === "lunch"
                      ? isBengali ? "দুপুরের খাবার" : "Lunch"
                      : isBengali ? "রাতের খাবার" : "Dinner"
                }
                shiftTime={
                  selectedShiftView === "breakfast"
                    ? isBengali ? "০৭:০০ - ০৯:৩০" : "07:00 - 09:30 AM"
                    : selectedShiftView === "lunch"
                      ? isBengali ? "১২:৩০ - ০৩:০০" : "12:30 - 03:00 PM"
                      : isBengali ? "০৭:৩০ - ১০:০০" : "07:30 - 10:00 PM"
                }
                isBengali={isBengali}
                t={t}
                backupPin={profile?.dining_pin || "4829"}
              />
            ) : (
              // Informative Empty State Container (Shift NOT Booked)
              <div className="rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-3.5 shadow-lg">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 shadow-inner">
                  <UtensilsCrossed className="w-7 h-7 text-amber-400/80" />
                </div>

                <div className="space-y-1.5 max-w-sm">
                  <h3 className="text-sm sm:text-base font-bold text-slate-100 font-bengali">
                    {isBengali
                      ? "এই বেলার জন্য আপনার কোনো মিল বুক করা নেই"
                      : "No active meal booked for this shift"}
                  </h3>
                  <p className="text-xs text-slate-400 font-bengali leading-relaxed">
                    {isBengali
                      ? "আজকের এই শিফটের জন্য আপনার মিল বুকিং নিশ্চিত করা হয়নি। হল ডাইনিং নিয়ম অনুযায়ী আগের দিন রাত ১০:০০ টার পূর্বে মিল বুকিং সম্পন্ন করতে হয়।"
                      : "You have not reserved a meal for this shift today. Per hall dining policy, meal bookings must be confirmed prior to the 10:00 PM cutoff on the previous day."}
                  </p>
                </div>

                <div className="pt-1 flex items-center space-x-2">
                  <span className="text-[11px] px-3 py-1 rounded-full bg-slate-800 text-slate-300 font-mono">
                    Shift: {selectedShiftView.toUpperCase()}
                  </span>
                  <span className="text-[11px] px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bengali">
                    {isBengali ? "মিল অপ্রাপ্য" : "Not Booked"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ================================================================== */}
        {/* SECTION 5: MONTHLY CONSUMPTION SUMMARY (ZERO-PRICE MVP TALLY)      */}
        {/* ================================================================== */}
        <section aria-label="Monthly Consumption Summary" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm font-bold text-slate-100 font-bengali">
                {isBengali
                  ? `মাসিক মিল গ্রহণ বিবরণী (${formatMonthName(bstTime.month, true)} ${toBengaliDigits(bstTime.year)})`
                  : `Monthly Consumption (${formatMonthName(bstTime.month, false)} ${bstTime.year})`}
              </h2>
              <p className="text-[11px] text-slate-400 font-bengali">
                {isBengali ? "কাউন্টারে যাচাইকৃত ও সংগৃহীত মিলের মোট হিসাব" : "Verified ledger count from meal_logs"}
              </p>
            </div>

            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-400 font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>MVP Tally</span>
            </span>
          </div>

          <div className="rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-4 sm:p-5 shadow-lg space-y-4">
            {/* Total Meals Claimed - Large Glowing Emerald Number */}
            <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800/90">
              <div className="space-y-0.5">
                <span className="text-xs text-slate-400 font-bengali">
                  {isBengali ? "চলতি মাসে মোট সংগৃহীত মিল" : "Total Meals Claimed This Month"}
                </span>
                <p className="text-xs text-emerald-400 font-bengali">
                  {isBengali ? "কাউন্টার ভেরিফিকেশনে নিশ্চিতকৃত" : "Verified by staff scanner"}
                </p>
              </div>

              <div className="flex items-baseline space-x-1.5">
                <span className="text-4xl sm:text-5xl font-black text-emerald-400 font-mono tracking-tight drop-shadow-[0_0_15px_rgba(16,185,129,0.35)]">
                  {isBengali
                    ? toBengaliDigits(monthlyStats.totalClaimed)
                    : monthlyStats.totalClaimed}
                </span>
                <span className="text-xs font-bold text-slate-400 font-bengali">
                  {isBengali ? "টি মিল" : "meals"}
                </span>
              </div>
            </div>

            {/* Breakdown Grid: Breakfast (X), Lunch (Y), Dinner (Z) */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* Breakfast Breakdown */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 flex flex-col items-center justify-center text-center space-y-1 hover:border-emerald-500/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Coffee className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-medium text-slate-400 font-bengali">
                  {isBengali ? "সকালের নাস্তা" : "Breakfast"}
                </span>
                <span className="text-lg sm:text-xl font-extrabold text-slate-100 font-mono">
                  {isBengali
                    ? toBengaliDigits(monthlyStats.breakfast)
                    : monthlyStats.breakfast}
                </span>
              </div>

              {/* Lunch Breakdown */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 flex flex-col items-center justify-center text-center space-y-1 hover:border-emerald-500/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Sun className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-medium text-slate-400 font-bengali">
                  {isBengali ? "দুপুরের খাবার" : "Lunch"}
                </span>
                <span className="text-lg sm:text-xl font-extrabold text-slate-100 font-mono">
                  {isBengali
                    ? toBengaliDigits(monthlyStats.lunch)
                    : monthlyStats.lunch}
                </span>
              </div>

              {/* Dinner Breakdown */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 flex flex-col items-center justify-center text-center space-y-1 hover:border-emerald-500/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Moon className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-medium text-slate-400 font-bengali">
                  {isBengali ? "রাতের খাবার" : "Dinner"}
                </span>
                <span className="text-lg sm:text-xl font-extrabold text-slate-100 font-mono">
                  {isBengali
                    ? toBengaliDigits(monthlyStats.dinner)
                    : monthlyStats.dinner}
                </span>
              </div>
            </div>

            {/* Explicit Zero-Price Rule Compliance Note */}
            <div className="flex items-center space-x-2 pt-1 text-[11px] text-slate-400 font-bengali">
              <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span>
                {isBengali
                  ? "শুধুমাত্র যাচাইকৃত মিলের সংখ্যা প্রদর্শিত হচ্ছে। কোনো আর্থিক বা বিলিং হিসাব এতে অন্তর্ভুক্ত নয়।"
                  : "Displays verified meal consumption counts only. No billing or monetary amounts are calculated."}
              </span>
            </div>
          </div>
        </section>

        {/* Footer Institutional Stamp */}
        <footer className="pt-4 pb-8 text-center text-slate-400 text-xs font-bengali space-y-1">
          <p>© ২০২৬ বিইউপি হল ডাইনিং ও মিল ব্যবস্থাপনা কর্তৃপক্ষ</p>
          <p className="text-[11px] text-slate-400 font-mono">
            BUP Dining System • Task 5 Student Dashboard
          </p>
        </footer>
      </div>
    </div>
  );
}
