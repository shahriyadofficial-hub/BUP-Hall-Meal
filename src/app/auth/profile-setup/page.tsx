"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Sparkles,
  Building2,
  User,
  Mail,
  Hash,
  DoorClosed,
  Calendar,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Camera,
  Layers,
  Phone,
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DepartmentSelector } from "@/components/DepartmentSelector";
import { supabase } from "@/lib/supabase/client";
import { HallType } from "@/types";
import { extractStudentIdFromEmail } from "@/lib/auth-utils";
import { normalizeHallSerial } from "@/lib/hall-serial";
import { submitProfileSetupAction } from "./actions";

const ACADEMIC_SESSIONS = [
  "2025-2026",
  "2024-2025",
  "2023-2024",
  "2022-2023",
  "2021-2022",
  "2020-2021",
];

export default function ProfileSetupPage() {
  const router = useRouter();
  const { isBengali } = useTranslation();

  // Auth User Data
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<string>("google");

  // Profile Form Fields
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [hallSerial, setHallSerial] = useState("");
  const [hall, setHall] = useState<HallType>("male");
  const [roomNumber, setRoomNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [academicSession, setAcademicSession] = useState("2024-2025");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pin, setPin] = useState("1234");

  // Status
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const u = session.user;
          setUserId(u.id);
          const userEmail = u.email || "";
          setEmail(userEmail);

          // Extract Google provider info
          const meta = u.user_metadata || {};
          const name = meta.full_name || meta.name || "";
          if (name) setFullName(name);
          const photo = meta.avatar_url || meta.picture || null;
          if (photo) setAvatarUrl(photo);
          if (u.app_metadata?.provider) setAuthProvider(u.app_metadata.provider);

          // Extract numeric student ID if email is @student.bup.edu.bd
          const extractedId = extractStudentIdFromEmail(userEmail);
          if (extractedId && /^\d+$/.test(extractedId)) {
            setStudentId(extractedId);
            setHallSerial(extractedId.slice(-3));
          }

          // Check if user already completed profile in public.users
          const { data: existing } = await supabase
            .from("users")
            .select("id, student_id, full_name, hall, room_number, department, is_approved")
            .eq("id", u.id)
            .maybeSingle();

          if (existing && existing.student_id && existing.room_number) {
            router.push("/student/dashboard");
            return;
          }
        } else {
          // If no session, allow local testing or redirect to login
          const storedEmail = typeof window !== "undefined" ? sessionStorage.getItem("bup_auth_email") : null;
          if (storedEmail) {
            setEmail(storedEmail);
            const extractedId = extractStudentIdFromEmail(storedEmail);
            if (extractedId) {
              setStudentId(extractedId);
              setHallSerial(extractedId.slice(-3));
            }
          }
        }
      } catch (err) {
        console.error("Session load error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!studentId.trim()) {
      setErrorMessage(isBengali ? "শিক্ষার্থী আইডি প্রয়োজন" : "Student ID is required");
      return;
    }
    if (!fullName.trim()) {
      setErrorMessage(isBengali ? "পূর্ণ নাম প্রয়োজন" : "Full Name is required");
      return;
    }
    if (!roomNumber.trim()) {
      setErrorMessage(isBengali ? "রুম নম্বর প্রয়োজন" : "Room Number is required");
      return;
    }
    if (!department.trim()) {
      setErrorMessage(isBengali ? "বিভাগ নির্বাচন করুন" : "Please select your department");
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedSerial = normalizeHallSerial(hallSerial || studentId.slice(-3) || "001");
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = userId || session?.user?.id;

      // Primary: Server Action with cache revalidation
      let isSuccess = false;
      try {
        const actionResult = await submitProfileSetupAction({
          userId: currentUserId,
          studentId: studentId.trim(),
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          avatarUrl,
          hallSerial: normalizedSerial,
          hall,
          roomNumber: roomNumber.trim(),
          department: department.trim(),
          academicSession: academicSession.trim(),
          phoneNumber: phoneNumber.trim(),
          pin: pin.trim() || "1234",
        });

        if (actionResult.success) {
          isSuccess = true;
        }
      } catch (actionErr) {
        console.warn("[ProfileSetup] Server action fallback to API:", actionErr);
      }

      // Secondary fallback: API route
      if (!isSuccess) {
        const token = session?.access_token;
        const res = await fetch("/api/auth/profile-setup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            userId: currentUserId,
            studentId: studentId.trim(),
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            avatarUrl,
            hallSerial: normalizedSerial,
            hall,
            roomNumber: roomNumber.trim(),
            department: department.trim(),
            session: academicSession.trim(),
            phoneNumber: phoneNumber.trim(),
            pin: pin.trim() || "1234",
            authProvider,
          }),
        });

        const result = await res.json();
        if (res.ok && result.success) {
          isSuccess = true;
        } else {
          // Direct client-side update fallback
          if (currentUserId) {
            const { error: directError } = await supabase
              .from("users")
              .update({
                full_name: fullName.trim(),
                student_id: studentId.trim(),
                department: department.trim(),
                room_number: roomNumber.trim(),
                hall_serial: parseInt(normalizedSerial.replace(/\D/g, "") || "1", 10),
                is_onboarded: true,
                is_approved: true,
              })
              .eq("id", currentUserId);

            if (!directError) {
              isSuccess = true;
            } else {
              throw new Error(result.error || directError.message || "Failed to complete profile setup");
            }
          } else {
            throw new Error(result.error || "Failed to complete profile setup");
          }
        }
      }

      // Successful onboarding! Force direct navigation to student dashboard
      if (typeof window !== "undefined") {
        window.location.assign("/student/dashboard");
      } else {
        router.push("/student/dashboard");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving profile";
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-bengali">লোড হচ্ছে...</span>
        </div>
      </div>
    );
  }

  const isBupEdu = email.toLowerCase().endsWith("bup.edu.bd");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start px-4 py-8 relative selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Background Institutional Ambient Glow */}
      <div className="fixed top-12 left-1/2 -translate-x-1/2 w-full max-w-2xl h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed -bottom-20 right-10 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-xl flex items-center justify-between mb-6 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Building2 className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <span className="text-[10px] tracking-wider uppercase font-semibold text-emerald-400 block font-mono">
              BUP Hall Dining System
            </span>
            <span className="text-sm font-bold text-slate-100 font-bengali">
              {isBengali ? "হল প্রোফাইল সেটআপ" : "Hall Profile Setup"}
            </span>
          </div>
        </div>

        <LanguageToggle />
      </header>

      {/* Main Glassy Form Card */}
      <main className="w-full max-w-xl z-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl shadow-black/40 space-y-6"
        >
          {/* Card Title & Step Indicator */}
          <div className="border-b border-white/10 pb-4">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-2 font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Step 2 of 2 • Universal Onboarding</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 font-bengali">
              {isBengali ? "আবাসিক হল তথ্যাদি সম্পন্ন করুন" : "Complete Residential Hall Details"}
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-bengali">
              {isBengali
                ? "ডাইনিং মিল গ্রহণ ও কাউন্টার ভেরিফিকেশনের জন্য আপনার প্রোফাইলটি সংরক্ষণ করুন。"
                : "Fill in your room and student details to enable instant counter meal claim."}
            </p>
          </div>

          {/* Connected Google Account Pill */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 truncate">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="w-10 h-10 rounded-xl object-cover border border-white/20"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 border border-white/10">
                  <User className="w-5 h-5" />
                </div>
              )}
              <div className="truncate">
                <span className="text-xs font-semibold text-slate-200 block truncate">
                  {fullName || "Authenticated User"}
                </span>
                <span className="text-[11px] text-slate-400 font-mono block truncate">
                  {email || "Connected via Google"}
                </span>
              </div>
            </div>

            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border shrink-0 ${
              isBupEdu
                ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-300"
                : "bg-blue-950/50 border-blue-500/40 text-blue-300"
            }`}>
              {isBupEdu ? "✓ BUP Edu" : "✓ Google User"}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="font-bengali">{isBengali ? "পূর্ণ নাম (অফিশিয়াল)" : "Full Name"}</span>
                <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Tanvir Ahmed"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Student ID & Short Hall Serial Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Student ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span className="font-bengali">{isBengali ? "শিক্ষার্থী আইডি (Student ID)" : "Student ID"}</span>
                  <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Hash className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={studentId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStudentId(val);
                      if (!hallSerial || hallSerial === studentId.slice(-3)) {
                        setHallSerial(val.slice(-3));
                      }
                    }}
                    placeholder="e.g. 25251710025"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Hall Serial Number (Short Keypad Identifier) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span className="font-bengali">{isBengali ? "হল সিরিয়াল নম্বর (১ - ৫০০)" : "Hall Serial #"}</span>
                  <span className="text-xs font-mono text-emerald-400">Counter Fast Key</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400 font-bold font-mono">
                    #
                  </div>
                  <input
                    type="text"
                    maxLength={4}
                    value={hallSerial}
                    onChange={(e) => setHallSerial(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="e.g. 042"
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-950 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Department (Official BUP constants via <DepartmentSelector>) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="font-bengali">{isBengali ? "বিভাগ / অনুষদ" : "Department"}</span>
                <span className="text-emerald-400">*</span>
              </label>
              <DepartmentSelector
                value={department}
                onChange={setDepartment}
                isBengali={isBengali}
                placeholder={isBengali ? "বিভাগ নির্বাচন করুন" : "Select official BUP department"}
              />
            </div>

            {/* Hall Selection & Room Number Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Hall Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{isBengali ? "আবাসিক হল" : "Residential Hall"}</span>
                  <span className="text-emerald-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setHall("male")}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium font-bengali transition-all ${
                      hall === "male"
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {isBengali ? "বিইউপি ছাত্র হল" : "Male Hall"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHall("female")}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium font-bengali transition-all ${
                      hall === "female"
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {isBengali ? "বিইউপি ছাত্রী হল" : "Female Hall"}
                  </button>
                </div>
              </div>

              {/* Room Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{isBengali ? "রুম নম্বর" : "Room Number"}</span>
                  <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <DoorClosed className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder="e.g. 718 / 402"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Academic Session & Dining PIN Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Session */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali">
                  {isBengali ? "শিক্ষাবর্ষ (Session)" : "Academic Session"}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <select
                    value={academicSession}
                    onChange={(e) => setAcademicSession(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {ACADEMIC_SESSIONS.map((s) => (
                      <option key={s} value={s} className="bg-slate-900 text-slate-100">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4-Digit Dining PIN (for dead battery fallback) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between font-bengali">
                  <span>{isBengali ? "ডাইনিং পিন (৪ ডিজিট)" : "Dining PIN (4-Digit)"}</span>
                  <span className="text-[10px] text-slate-500 font-mono">Backup</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="1234"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-bengali">
                {errorMessage}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 transition-all duration-200 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span className="font-bengali">{isBengali ? "প্রোফাইল সংরক্ষণ করা হচ্ছে..." : "Saving Profile..."}</span>
                </>
              ) : (
                <>
                  <span className="font-bengali">{isBengali ? "প্রোফাইল নিশ্চিত করুন ও ড্যাশবোর্ডে যান" : "Complete Setup & Open Dashboard"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
