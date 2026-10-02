"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Building2, 
  UserCheck, 
  IdCard, 
  DoorClosed, 
  Phone, 
  User, 
  Mail,
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  ShieldCheck,
  GraduationCap,
  Droplet,
  Calendar,
  KeyRound,
  RotateCcw,
  Info
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PassportPhotoUpload } from "@/components/PassportPhotoUpload";
import { DiningPinInput } from "@/components/DiningPinInput";
import { supabase } from "@/lib/supabase/client";
import { HallType } from "@/types";
import { isValidBangladeshiPhone, normalizePhoneNumber, isValidBupEmail, isValidEmail } from "@/lib/auth-pin";

const POPULAR_DEPARTMENTS = [
  "Information & Communication Technology (ICT)",
  "Computer Science & Engineering (CSE)",
  "Business Administration (BBA)",
  "Economics",
  "English",
  "International Relations (IR)",
  "Law",
  "Public Administration",
  "Environmental Science",
  "Mass Communication & Journalism",
  "Development Studies",
  "Sociology",
  "Disaster Management & Resilience",
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const ACADEMIC_SESSIONS = [
  "2025-2026",
  "2024-2025",
  "2023-2024",
  "2022-2023",
  "2021-2022",
  "2020-2021",
  "2019-2020",
];

export default function StudentOnboardingPage() {
  const router = useRouter();
  const { t, isBengali } = useTranslation();

  // Active Authenticated User info
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [authMethod, setAuthMethod] = useState<"email" | "phone">("email");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [department, setDepartment] = useState("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [session, setSession] = useState("");
  const [hall, setHall] = useState<HallType>("male");
  const [roomNumber, setRoomNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [validatedPin, setValidatedPin] = useState<string | null>(null);

  // Phone Verification States
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [showPhoneOtpBox, setShowPhoneOtpBox] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpError, setPhoneOtpError] = useState<string | null>(null);
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);
  const [phoneDemoOtp, setPhoneDemoOtp] = useState<string | null>(null);

  // Status & Validation
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdu = authMethod === "email" && isValidBupEmail(userEmail);

  /**
   * Check Supabase authentication and pre-populate if session exists
   */
  useEffect(() => {
    async function loadUserSession() {
      try {
        if (typeof window !== "undefined") {
          const storedEmail = sessionStorage.getItem("bup_auth_email");
          const storedPhone = sessionStorage.getItem("bup_auth_phone");
          const storedMethod = sessionStorage.getItem("bup_auth_method") as "email" | "phone" | null;
          const isPhoneAuthVerified = sessionStorage.getItem("bup_auth_phone_verified") === "true";

          if (storedMethod) {
            setAuthMethod(storedMethod);
          } else if (storedPhone && !storedEmail) {
            setAuthMethod("phone");
          }

          if (storedEmail) setUserEmail(storedEmail);
          if (storedPhone) {
            setPhoneNumber(storedPhone);
            if (isPhoneAuthVerified) setIsPhoneVerified(true);
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserId(session.user.id);
          if (session.user.email) {
            setUserEmail(session.user.email);
            setAuthMethod("email");
          }
          if (session.access_token) {
            setAccessToken(session.access_token);
          }

          // Check if already approved or pending in public.users
          const { data: profile } = await supabase
            .from("users")
            .select("id, student_id, full_name, department, blood_group, session, hall, room_number, phone_number, phone_verified, is_approved")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profile && profile.student_id) {
            if (profile.is_approved) {
              router.push("/student/dashboard");
              return;
            } else {
              router.push("/auth/pending");
              return;
            }
          }
        } else {
          // If in preview or test state without Supabase auth session
          const tempId = typeof window !== "undefined" ? localStorage.getItem("bup_temp_user_id") : null;
          const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (tempId && isValidUuid.test(tempId)) {
            setUserId(tempId);
          } else {
            const newTempId = typeof window !== "undefined" && window.crypto?.randomUUID 
              ? window.crypto.randomUUID() 
              : "00000000-0000-4000-8000-000000000001";
            if (typeof window !== "undefined") {
              localStorage.setItem("bup_temp_user_id", newTempId);
            }
            setUserId(newTempId);
          }
        }
      } catch (err) {
        console.warn("[Onboarding] Auth session check:", err);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    loadUserSession();
  }, [router]);

  /**
   * Send Phone Verification SMS OTP
   */
  const handleSendPhoneOtp = async () => {
    setPhoneOtpError(null);
    setPhoneDemoOtp(null);

    const cleanPhone = phoneNumber.trim();
    if (!cleanPhone) {
      setPhoneOtpError(
        isBengali
          ? "অনুগ্রহ করে আপনার মোবাইল নম্বর লিখুন"
          : "Please enter your mobile phone number"
      );
      return;
    }

    if (!isValidBangladeshiPhone(cleanPhone)) {
      setPhoneOtpError(t.auth.invalidPhoneError);
      return;
    }

    setIsSendingPhoneOtp(true);

    try {
      const normalized = normalizePhoneNumber(cleanPhone);
      const res = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phoneNumber: normalized }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to send phone OTP");
      }

      setShowPhoneOtpBox(true);
      if (data.demoOtp) {
        setPhoneDemoOtp(data.demoOtp);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send verification code";
      setPhoneOtpError(msg);
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  /**
   * Verify Submitted Phone OTP
   */
  const handleVerifyPhoneOtp = async () => {
    setPhoneOtpError(null);
    const cleanOtp = phoneOtp.trim();

    if (!cleanOtp || cleanOtp.length !== 6) {
      setPhoneOtpError(
        isBengali ? "সঠিক ৬ ডিজিটের ওটিপি কোড দিন" : "Enter a valid 6-digit OTP code"
      );
      return;
    }

    setIsVerifyingPhoneOtp(true);

    try {
      const normalized = normalizePhoneNumber(phoneNumber);
      const res = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          phoneNumber: normalized,
          otp: cleanOtp,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Invalid OTP code");
      }

      setIsPhoneVerified(true);
      setShowPhoneOtpBox(false);
      setPhoneOtp("");
      if (formErrors.phoneNumber) {
        setFormErrors((prev) => {
          const copy = { ...prev };
          delete copy.phoneNumber;
          return copy;
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setPhoneOtpError(msg);
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

  /**
   * Validates form fields prior to submission
   */
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.fullName = isBengali
        ? "আপনার পূর্ণ নাম (অফিশিয়াল) লিখুন"
        : "Full name is required";
    }

    if (!userEmail.trim()) {
      errors.email = isBengali
        ? "একটি কার্যকর ইমেইল এড্রেস প্রদান করুন"
        : "Email address is required";
    } else if (!isValidEmail(userEmail.trim())) {
      errors.email = isBengali
        ? "একটি সঠিক ইমেইল এড্রেস লিখুন"
        : "Please enter a valid email address";
    }

    if (!studentId.trim()) {
      errors.studentId = isBengali
        ? "স্টুডেন্ট আইডি প্রদান করুন (উদাঃ 2302001)"
        : "Student ID is required (e.g. 2302001)";
    } else if (!/^[a-zA-Z0-9_-]{4,20}$/.test(studentId.trim())) {
      errors.studentId = isBengali
        ? "স্টুডেন্ট আইডি শুধুমাত্র অক্ষর ও সংখ্যা হতে হবে"
        : "Student ID must be alphanumeric";
    }

    const resolvedDept = department === "Other" ? customDepartment.trim() : department.trim();
    if (!resolvedDept) {
      errors.department = isBengali
        ? "আপনার বিভাগ নির্বাচন বা উল্লেখ করুন"
        : "Department is required";
    }

    if (!bloodGroup.trim()) {
      errors.bloodGroup = isBengali
        ? "রক্তের গ্রুপ নির্বাচন করুন"
        : "Blood group is required";
    }

    if (!session.trim()) {
      errors.session = isBengali
        ? "শিক্ষাবর্ষ (সেশন) নির্বাচন করুন"
        : "Academic session is required";
    }

    if (!roomNumber.trim()) {
      errors.roomNumber = isBengali
        ? "রুম নম্বর প্রদান করুন (উদাঃ ৪০২)"
        : "Room number is required (e.g. 402)";
    }

    if (!phoneNumber.trim()) {
      errors.phoneNumber = isBengali
        ? "সচল মোবাইল নম্বর প্রদান করুন"
        : "Phone number is required";
    } else if (!isValidBangladeshiPhone(phoneNumber)) {
      errors.phoneNumber = t.auth.invalidPhoneError;
    } else if (!isPhoneVerified) {
      errors.phoneNumber = t.auth.phoneVerificationRequired;
    }

    if (!photoUrl) {
      errors.photo = isBengali
        ? "অনুগ্রহ করে একটি অফিশিয়াল পাসপোর্ট সাইজ ছবি আপলোড করুন"
        : "Official passport photo is required";
    }

    if (!validatedPin) {
      errors.pin = isBengali
        ? "অনুগ্রহ করে ৪ ডিজিটের ডাইনিং পিন সেট ও নিশ্চিত করুন"
        : "4-Digit Dining PIN must be set and confirmed";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handle complete onboarding submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validateForm()) {
      setSubmitError(t.auth.allFieldsRequired);
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: Send PIN to /api/auth/set-pin for crypto hashing & storage
      let pinHash = "";
      try {
        const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (accessToken) {
          authHeaders["Authorization"] = `Bearer ${accessToken}`;
        }

        const pinRes = await fetch("/api/auth/set-pin", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            pin: validatedPin,
            userId: userId || undefined,
          }),
        });

        if (pinRes.ok) {
          const pinData = await pinRes.json();
          pinHash = pinData.pinHash || "";
        }
      } catch (pinErr) {
        console.warn("[Onboarding] /api/auth/set-pin call warning:", pinErr);
      }

      // Step 2: Submit complete profile to /api/auth/onboarding
      const resolvedDept = department === "Other" ? customDepartment.trim() : department.trim();
      const profilePayload = {
        userId: userId || undefined,
        authMethod,
        studentId: studentId.trim(),
        fullName: fullName.trim(),
        email: userEmail.trim().toLowerCase(),
        department: resolvedDept,
        bloodGroup: bloodGroup.trim(),
        session: session.trim(),
        hall,
        roomNumber: roomNumber.trim(),
        phoneNumber: normalizePhoneNumber(phoneNumber.trim()),
        isPhoneVerified: Boolean(isPhoneVerified),
        profilePhotoUrl: photoUrl,
        pin: validatedPin,
        pinHash,
      };

      const onboardingHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) {
        onboardingHeaders["Authorization"] = `Bearer ${accessToken}`;
      }

      const onboardingRes = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: onboardingHeaders,
        body: JSON.stringify(profilePayload),
      });

      const responseData = await onboardingRes.json();

      if (!onboardingRes.ok) {
        throw new Error(responseData.error || "Failed to submit onboarding profile");
      }

      // Store submitted profile in session cache so Pending screen can display immediately
      const isApproved = Boolean(responseData.isApproved);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "bup_pending_student",
          JSON.stringify({
            id: responseData.user?.id || userId,
            student_id: studentId.trim(),
            full_name: fullName.trim(),
            department: resolvedDept,
            blood_group: bloodGroup.trim(),
            session: session.trim(),
            hall,
            room_number: roomNumber.trim(),
            phone_number: normalizePhoneNumber(phoneNumber.trim()),
            profile_photo_url: photoUrl,
            email: userEmail.trim().toLowerCase(),
            is_approved: isApproved,
          })
        );
      }

      // Step 3: Route based on whether automatically approved (edu mail) or pending manual verification
      if (isApproved) {
        // Logged in with official edu mail -> Auto-approved to Dashboard
        router.push("/student/dashboard");
      } else {
        // Non-edu email or phone login -> Hall authority manual verification
        router.push("/auth/pending");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred during submission";
      setSubmitError(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-slate-100 flex flex-col items-center justify-start px-4 py-8 relative">
      {/* Background Institutional Glow */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full max-w-xl h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Institutional Header Container */}
      <header className="w-full max-w-xl flex items-center justify-between mb-6 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-emerald-glow">
            <UserCheck className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <span className="text-[10px] tracking-wider uppercase font-semibold text-emerald-400 block font-mono">
              BUP Residential Halls
            </span>
            <span className="text-sm font-bold text-slate-100 font-bengali">
              {t.common.appName}
            </span>
          </div>
        </div>

        {/* Bilingual Language Switcher */}
        <LanguageToggle />
      </header>

      {/* Main Form Container */}
      <main className="w-full max-w-xl z-10">
        <div className="glass-card p-6 sm:p-8 border border-slate-800/80 shadow-2xl relative space-y-6">
          {/* Header Title Banner */}
          <div className="border-b border-slate-800/80 pb-4">
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-2 font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Step 2 of 2 • Student Onboarding</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 font-bengali">
              {t.auth.onboardingTitle}
            </h1>
            <p className="text-xs text-slate-400 mt-1 font-bengali">
              {t.auth.onboardingSubtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ========================================================
             * SECTION 1: Personal Details (Name, ID, Dept, Blood Group, Session, Phone, Hall, Room)
             * ======================================================== */}
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-emerald-400 flex items-center space-x-2 font-bengali">
                <IdCard className="w-4 h-4" />
                <span>{t.auth.personalDetails}</span>
              </h2>

              {/* Authenticated Account Identity Banner with Approval Notice */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-slate-300 font-mono truncate max-w-[220px] sm:max-w-xs">
                      {authMethod === "phone" ? (phoneNumber ? `Phone: ${phoneNumber}` : "Phone Login") : (userEmail || "Email Login")}
                    </span>
                  </div>
                  <span className={`text-[11px] font-medium font-bengali px-2 py-0.5 rounded-full border ${
                    isEdu
                      ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                      : "bg-amber-950/30 border-amber-500/30 text-amber-300"
                  }`}>
                    {authMethod === "phone"
                      ? (isBengali ? "ফোন নম্বর (ম্যানুয়াল যাচাই)" : "Phone Login (Manual Verification)")
                      : isEdu 
                      ? (isBengali ? "প্রাতিষ্ঠানিক ইমেইল (স্বয়ংক্রিয় অনুমোদন)" : "Official Edu Email (Auto-Approved)")
                      : (isBengali ? "নন-এডু ইমেইল (ম্যানুয়াল যাচাই)" : "Non-Edu Email (Manual Verification)")}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-bengali leading-relaxed">
                  {isEdu
                    ? (isBengali
                        ? "✓ বিইউপি প্রাতিষ্ঠানিক ইমেইল (@bup.edu.bd) দ্বারা লগইন করায় প্রোফাইলটি স্বয়ংক্রিয়ভাবে সরাসরি অনুমোদিত হবে।"
                        : "✓ Official BUP email detected. Your account will be automatically verified upon submission.")
                    : (isBengali
                        ? "ℹ বিইউপি প্রাতিষ্ঠানিক ইমেইল ছাড়া (ফোন নম্বর বা ব্যক্তিগত ইমেইলে) লগইন করায়, হল কর্তৃপক্ষ ম্যানুয়ালি যাচাইয়ের পর মিল সুবিধা সক্রিয় হবে।"
                        : "ℹ Non-edu or phone login. Hall administration will manually verify your identity before activation.")}
                </p>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{t.auth.fullName}</span>
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
                    placeholder={t.auth.fullNamePlaceholder}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans placeholder:text-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      formErrors.fullName
                        ? "border-rose-500/80 focus:ring-rose-500"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  />
                </div>
                {formErrors.fullName && (
                  <p className="text-[11px] text-rose-400 font-bengali">{formErrors.fullName}</p>
                )}
              </div>

              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{isBengali ? "ইমেইল এড্রেস" : "Email Address"}</span>
                  <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={userEmail}
                    disabled={Boolean(accessToken && authMethod === "email")}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder={authMethod === "email" ? t.auth.emailPlaceholder : "yourname@gmail.com / student@bup.edu.bd"}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans placeholder:text-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      Boolean(accessToken && authMethod === "email") ? "opacity-75 cursor-not-allowed bg-slate-900" : ""
                    } ${
                      formErrors.email
                        ? "border-rose-500/80 focus:ring-rose-500"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  />
                </div>
                {formErrors.email && (
                  <p className="text-[11px] text-rose-400 font-bengali">{formErrors.email}</p>
                )}
              </div>

              {/* Student ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{t.auth.studentId}</span>
                  <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <IdCard className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder={t.auth.studentIdPlaceholder}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-mono placeholder:text-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      formErrors.studentId
                        ? "border-rose-500/80 focus:ring-rose-500"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  />
                </div>
                {formErrors.studentId && (
                  <p className="text-[11px] text-rose-400 font-bengali">{formErrors.studentId}</p>
                )}
              </div>

              {/* Department Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{t.auth.department}</span>
                  <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      formErrors.department
                        ? "border-rose-500/80 focus:ring-rose-500"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <option value="" disabled>
                      {t.auth.departmentPlaceholder}
                    </option>
                    {POPULAR_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept} className="bg-slate-900 text-slate-100">
                        {dept}
                      </option>
                    ))}
                    <option value="Other" className="bg-slate-900 text-slate-100">
                      {isBengali ? "অন্যান্য (লিখুন)" : "Other (Specify)"}
                    </option>
                  </select>
                </div>

                {department === "Other" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="pt-2"
                  >
                    <input
                      type="text"
                      value={customDepartment}
                      onChange={(e) => setCustomDepartment(e.target.value)}
                      placeholder={isBengali ? "আপনার বিভাগের নাম লিখুন" : "Enter your department name"}
                      className={`w-full px-4 py-2 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        formErrors.department ? "border-rose-500/80 focus:ring-rose-500" : "border-slate-800"
                      }`}
                    />
                  </motion.div>
                )}

                {formErrors.department && (
                  <p className="text-[11px] text-rose-400 font-bengali">{formErrors.department}</p>
                )}
              </div>

              {/* Blood Group and Academic Session Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Blood Group */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                    <span>{t.auth.bloodGroup}</span>
                    <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-rose-400">
                      <Droplet className="w-4 h-4" />
                    </div>
                    <select
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        formErrors.bloodGroup
                          ? "border-rose-500/80 focus:ring-rose-500"
                          : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <option value="" disabled>
                        {t.auth.bloodGroupPlaceholder}
                      </option>
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg} className="bg-slate-900 text-slate-100 font-mono">
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>
                  {formErrors.bloodGroup && (
                    <p className="text-[11px] text-rose-400 font-bengali">{formErrors.bloodGroup}</p>
                  )}
                </div>

                {/* Session */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                    <span>{t.auth.session}</span>
                    <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <select
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-mono transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        formErrors.session
                          ? "border-rose-500/80 focus:ring-rose-500"
                          : "border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <option value="" disabled>
                        {t.auth.sessionPlaceholder}
                      </option>
                      {ACADEMIC_SESSIONS.map((sess) => (
                        <option key={sess} value={sess} className="bg-slate-900 text-slate-100 font-mono">
                          {sess}
                        </option>
                      ))}
                    </select>
                  </div>
                  {formErrors.session && (
                    <p className="text-[11px] text-rose-400 font-bengali">{formErrors.session}</p>
                  )}
                </div>
              </div>

              {/* Phone Number with In-line SMS Verification */}
              <div className="space-y-2 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center space-x-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.auth.phoneNumber}</span>
                    <span className="text-emerald-400">*</span>
                  </label>
                  {isPhoneVerified ? (
                    <span className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                      <ShieldCheck className="w-3 h-3" />
                      <span className="font-bengali">{t.auth.phoneVerified}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-400 font-bengali">
                      {t.auth.phoneNotVerified}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      disabled={isPhoneVerified}
                      onChange={(e) => {
                        setPhoneNumber(e.target.value);
                        setIsPhoneVerified(false);
                        setShowPhoneOtpBox(false);
                      }}
                      placeholder={t.auth.phoneNumberPlaceholder}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-mono placeholder:text-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        isPhoneVerified
                          ? "border-emerald-500/50 bg-emerald-950/10 text-emerald-300"
                          : formErrors.phoneNumber
                          ? "border-rose-500/80 focus:ring-rose-500"
                          : "border-slate-800 hover:border-slate-700"
                      }`}
                    />
                  </div>

                  {!isPhoneVerified ? (
                    <button
                      type="button"
                      disabled={isSendingPhoneOtp}
                      onClick={handleSendPhoneOtp}
                      className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-bengali whitespace-nowrap transition-colors flex items-center space-x-1 disabled:opacity-50"
                    >
                      {isSendingPhoneOtp ? (
                        <span>{t.auth.sendingPhoneOtp}</span>
                      ) : (
                        <span>{showPhoneOtpBox ? t.auth.resendOtp : t.auth.verifyPhone}</span>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsPhoneVerified(false);
                        setShowPhoneOtpBox(false);
                      }}
                      className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bengali transition-colors"
                    >
                      {isBengali ? "পরিবর্তন" : "Change"}
                    </button>
                  )}
                </div>

                {/* Inline Phone OTP Verification Box */}
                <AnimatePresence>
                  {showPhoneOtpBox && !isPhoneVerified && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pt-2 space-y-2 border-t border-slate-800"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-bengali">{t.auth.enterPhoneOtp}</span>
                        {phoneDemoOtp && (
                          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                            Demo Code: <strong>{phoneDemoOtp}</strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={phoneOtp}
                          onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="123456"
                          className="flex-1 px-3.5 py-2 text-center font-mono text-base tracking-widest font-bold rounded-xl bg-slate-950 border border-slate-700 text-emerald-400 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          disabled={isVerifyingPhoneOtp || phoneOtp.length !== 6}
                          onClick={handleVerifyPhoneOtp}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-bengali transition-colors disabled:opacity-50"
                        >
                          {isVerifyingPhoneOtp ? "..." : t.auth.confirmPhoneOtp}
                        </button>
                      </div>

                      {phoneDemoOtp && (
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneOtp(phoneDemoOtp);
                          }}
                          className="text-[10px] text-emerald-400 hover:underline font-mono"
                        >
                          Click here to auto-fill code: {phoneDemoOtp}
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {phoneOtpError && (
                  <p className="text-[11px] text-rose-400 font-bengali">{phoneOtpError}</p>
                )}
                {formErrors.phoneNumber && (
                  <p className="text-[11px] text-rose-400 font-bengali">{formErrors.phoneNumber}</p>
                )}
              </div>

              {/* Residential Hall Selection (Strictly BUP Male Hall & BUP Female Hall) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{t.auth.hall}</span>
                  <span className="text-emerald-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* BUP Male Hall */}
                  <button
                    type="button"
                    onClick={() => setHall("male")}
                    className={`py-3 px-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-medium transition-all ${
                      hall === "male"
                        ? "bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span className="font-bengali">{t.common.maleHall}</span>
                  </button>

                  {/* BUP Female Hall */}
                  <button
                    type="button"
                    onClick={() => setHall("female")}
                    className={`py-3 px-3 rounded-xl border flex items-center justify-center space-x-2 text-xs font-medium transition-all ${
                      hall === "female"
                        ? "bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span className="font-bengali">{t.common.femaleHall}</span>
                  </button>
                </div>
              </div>

              {/* Room Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                  <span>{t.auth.roomNumber}</span>
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
                    placeholder={t.auth.roomNumberPlaceholder}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans placeholder:text-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      formErrors.roomNumber
                        ? "border-rose-500/80 focus:ring-rose-500"
                        : "border-slate-800 hover:border-slate-700"
                    }`}
                  />
                </div>
                {formErrors.roomNumber && (
                  <p className="text-[11px] text-rose-400 font-bengali">{formErrors.roomNumber}</p>
                )}
              </div>
            </div>

            {/* ========================================================
             * SECTION 2: Passport Photo Upload Component
             * ======================================================== */}
            <div className="pt-4 border-t border-slate-800/80">
              <PassportPhotoUpload
                userId={userId || undefined}
                initialUrl={photoUrl}
                onPhotoUploaded={(url) => {
                  setPhotoUrl(url);
                  if (formErrors.photo) {
                    setFormErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.photo;
                      return copy;
                    });
                  }
                }}
              />
              {formErrors.photo && (
                <p className="text-[11px] text-rose-400 font-bengali mt-1.5">• {formErrors.photo}</p>
              )}
            </div>

            {/* ========================================================
             * SECTION 3: Personal 4-Digit Dining PIN Setup
             * ======================================================== */}
            <div className="pt-4 border-t border-slate-800/80">
              <DiningPinInput
                onPinValidated={(pin) => {
                  setValidatedPin(pin);
                  if (formErrors.pin && pin) {
                    setFormErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.pin;
                      return copy;
                    });
                  }
                }}
              />
              {formErrors.pin && (
                <p className="text-[11px] text-rose-400 font-bengali mt-1.5">• {formErrors.pin}</p>
              )}
            </div>

            {/* Global Error Banner */}
            <AnimatePresence>
              {submitError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center space-x-2 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/60 p-3 rounded-xl font-bengali"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{submitError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-emerald-glow flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed font-bengali"
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>{t.auth.submitting}</span>
                </div>
              ) : (
                <>
                  <span>{t.auth.submitOnboarding}</span>
                  <ArrowRight className="w-4 h-4 text-slate-950" />
                </>
              )}
            </button>
          </form>
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
