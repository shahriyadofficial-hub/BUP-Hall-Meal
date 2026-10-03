"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Utensils, 
  Mail, 
  Phone,
  KeyRound, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  ShieldCheck,
  Building2,
  Info
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { supabase } from "@/lib/supabase/client";
import { 
  isValidBupEmail, 
  isValidEmail, 
  isValidBangladeshiPhone, 
  normalizePhoneNumber 
} from "@/lib/auth-pin";

export default function LoginPage() {
  const router = useRouter();
  const { t, isBengali } = useTranslation();

  // Authentication Mode: 'email' | 'phone'
  const [authMode, setAuthMode] = useState<"email" | "phone">("email");

  // Step 1: 'input' | Step 2: 'otp'
  const [step, setStep] = useState<"input" | "otp">("input");
  
  // Input fields
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [demoCodeHint, setDemoCodeHint] = useState<string | null>(null);

  // 6-digit OTP state
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const otpRefs = [
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
  ];

  // Resend cooldown timer
  const [resendSeconds, setResendSeconds] = useState(60);
  const [isResendActive, setIsResendActive] = useState(false);

  const isEdu = authMode === "email" && isValidBupEmail(email);

  // Check if session already exists
  useEffect(() => {
    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          handlePostAuthRedirect(session.user.id);
        }
      } catch {
        // Ignore session read error on offline/clean state
      }
    }
    checkExistingSession();
  }, []);

  // Cooldown countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isResendActive && resendSeconds > 0) {
      timer = setInterval(() => {
        setResendSeconds((prev) => prev - 1);
      }, 1000);
    } else if (resendSeconds === 0) {
      setIsResendActive(false);
    }
    return () => clearInterval(timer);
  }, [isResendActive, resendSeconds]);

  /**
   * Post-authentication routing:
   * Inspects user profile and redirects to onboarding, pending, or dashboard.
   */
  const handlePostAuthRedirect = async (userId: string) => {
    try {
      // Fetch user profile from public.users
      const { data: userProfile, error } = await supabase
        .from("users")
        .select("id, student_id, is_approved")
        .eq("id", userId)
        .maybeSingle();

      if (error || !userProfile || !userProfile.student_id) {
        // User has not completed profile setup
        router.push("/auth/profile-setup");
        return;
      }

      // Approved student -> Dashboard
      router.push("/student/dashboard");
    } catch {
      // Fallback to profile setup
      router.push("/auth/profile-setup");
    }
  };

  /**
   * Universal Google OAuth Login
   */
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setGeneralError(null);
    try {
      const redirectUrl = typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : "/auth/callback";

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in with Google";
      setGeneralError(msg);
      setIsLoading(false);
    }
  };

  /**
   * Handle Send OTP for either Email or Phone Number
   */
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setInputError(null);
    setGeneralError(null);
    setDemoCodeHint(null);

    // ------------------------------------------------------------------
    // Case 1: Email Mode
    // ------------------------------------------------------------------
    if (authMode === "email") {
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedEmail) {
        setInputError(
          isBengali
            ? "অনুগ্রহ করে আপনার ইমেইল এড্রেস লিখুন।"
            : "Please enter your email address."
        );
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        setInputError(
          isBengali
            ? "একটি সঠিক ইমেইল এড্রেস লিখুন।"
            : "Please enter a valid email address."
        );
        return;
      }

      setIsLoading(true);

      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("bup_auth_email", trimmedEmail);
          sessionStorage.setItem("bup_auth_method", "email");
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: trimmedEmail,
          options: {
            shouldCreateUser: true,
          },
        });

        if (error) {
          console.warn("[Auth Login] signInWithOtp notice:", error.message);
          if (error.message.toLowerCase().includes("rate limit") || error.status === 429) {
            setGeneralError(
              isBengali
                ? "অতিরিক্ত ওটিপি অনুরোধ করা হয়েছে। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন।"
                : "Too many OTP requests. Please wait a few minutes before trying again."
            );
            setIsLoading(false);
            return;
          }
        }

        setStep("otp");
        setIsResendActive(true);
        setResendSeconds(60);

        setTimeout(() => {
          otpRefs[0]?.current?.focus();
        }, 100);
      } catch (err: unknown) {
        console.error("[Login] OTP request error:", err);
        setStep("otp");
        setIsResendActive(true);
        setResendSeconds(60);
      } finally {
        setIsLoading(false);
      }
    } 
    // ------------------------------------------------------------------
    // Case 2: Phone Mode
    // ------------------------------------------------------------------
    else {
      const cleanPhone = phoneNumber.trim();

      if (!cleanPhone) {
        setInputError(
          isBengali
            ? "অনুগ্রহ করে আপনার মোবাইল নম্বর লিখুন।"
            : "Please enter your mobile phone number."
        );
        return;
      }

      if (!isValidBangladeshiPhone(cleanPhone)) {
        setInputError(t.auth.invalidPhoneError);
        return;
      }

      const normalized = normalizePhoneNumber(cleanPhone);
      setIsLoading(true);

      try {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("bup_auth_phone", normalized);
          sessionStorage.setItem("bup_auth_method", "phone");
          sessionStorage.removeItem("bup_auth_email");
        }

        const res = await fetch("/api/auth/verify-phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send", phoneNumber: normalized }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to dispatch phone OTP");
        }

        if (data.demoOtp) {
          setDemoCodeHint(data.demoOtp);
        }

        setStep("otp");
        setIsResendActive(true);
        setResendSeconds(60);

        setTimeout(() => {
          otpRefs[0]?.current?.focus();
        }, 100);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to send phone OTP";
        setGeneralError(msg);
      } finally {
        setIsLoading(false);
      }
    }
  };

  /**
   * Handle pasting a 6-digit OTP code into any box
   */
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const chars = pasted.split("");
    const newOtp = ["", "", "", "", "", ""];
    chars.forEach((c, i) => {
      newOtp[i] = c;
    });
    setOtp(newOtp);

    const nextIdx = Math.min(chars.length, 5);
    otpRefs[nextIdx]?.current?.focus();

    if (chars.length === 6) {
      verifyOtpCode(newOtp.join(""));
    }
  };

  /**
   * Handle 6-Digit OTP Box inputs & auto-advance
   */
  const handleOtpChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, "");
    const newOtp = [...otp];

    if (!cleaned) {
      newOtp[index] = "";
      setOtp(newOtp);
      return;
    }

    if (cleaned.length > 1) {
      newOtp[index] = cleaned.slice(-1);
      setOtp(newOtp);
      if (index < 5) {
        otpRefs[index + 1]?.current?.focus();
      } else {
        const fullOtp = newOtp.join("");
        if (fullOtp.length === 6) {
          verifyOtpCode(fullOtp);
        }
      }
      return;
    }

    newOtp[index] = cleaned[0];
    setOtp(newOtp);

    if (index < 5) {
      otpRefs[index + 1]?.current?.focus();
    } else {
      const fullOtp = newOtp.join("");
      if (fullOtp.length === 6) {
        verifyOtpCode(fullOtp);
      }
    }
  };

  /**
   * Handle OTP Box Backspace navigation
   */
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        otpRefs[index - 1]?.current?.focus();
      }
    }
  };

  /**
   * Verify the 6-digit OTP code with Supabase (Email) or Phone OTP route
   */
  const verifyOtpCode = async (otpString?: string) => {
    setGeneralError(null);
    const token = otpString || otp.join("");

    if (token.length !== 6) {
      setGeneralError(
        isBengali
          ? "অনুগ্রহ করে পূর্ণাঙ্গ ৬ ডিজিটের ওটিপি লিখুন।"
          : "Please enter the complete 6-digit OTP code."
      );
      return;
    }

    setIsLoading(true);

    try {
      // ----------------------------------------------------
      // Case 1: Phone OTP Verification
      // ----------------------------------------------------
      if (authMode === "phone") {
        const normalized = normalizePhoneNumber(phoneNumber);
        const res = await fetch("/api/auth/verify-phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "verify",
            phoneNumber: normalized,
            otp: token,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || t.auth.expiredOtpError);
        }

        // Phone verified successfully!
        if (typeof window !== "undefined") {
          sessionStorage.setItem("bup_auth_phone_verified", "true");
          sessionStorage.setItem("bup_auth_phone", normalized);
          sessionStorage.setItem("bup_auth_method", "phone");
        }

        // Check if this phone number already belongs to a registered student profile
        try {
          const meRes = await fetch(`/api/auth/me?phone=${encodeURIComponent(normalized)}`);
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.profile && meData.profile.student_id) {
              if (typeof window !== "undefined") {
                sessionStorage.setItem(
                  "bup_pending_student",
                  JSON.stringify({
                    id: meData.profile.id,
                    student_id: meData.profile.student_id,
                    full_name: meData.profile.full_name,
                    department: meData.profile.department,
                    blood_group: meData.profile.blood_group,
                    session: meData.profile.session,
                    hall: meData.profile.hall,
                    room_number: meData.profile.room_number,
                    phone_number: meData.profile.phone_number,
                    profile_photo_url: meData.profile.profile_photo_url,
                    email: meData.profile.email,
                    is_approved: Boolean(meData.isApproved),
                  })
                );
              }

              if (meData.isApproved) {
                router.push("/student/dashboard");
              } else {
                router.push("/auth/pending");
              }
              return;
            }
          }
        } catch {
          // If lookup fails, route to onboarding as fallback
        }

        // New student profile registration
        router.push("/auth/onboarding");
        return;
      }

      // ----------------------------------------------------
      // Case 2: Email OTP Verification (Supabase)
      // ----------------------------------------------------
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });

      if (error) {
        console.warn("[Login] verifyOtp error:", error.message);
        setGeneralError(t.auth.expiredOtpError);
        setIsLoading(false);
        return;
      }

      const userId = data.user?.id || (await supabase.auth.getUser()).data.user?.id;
      if (userId) {
        await handlePostAuthRedirect(userId);
      } else {
        router.push("/auth/onboarding");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      console.error("[Login] verifyOtp failed:", msg);
      setGeneralError(msg);
      // In offline / mock dev mode fallback:
      if (process.env.NODE_ENV !== "production") {
        router.push("/auth/onboarding");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-950 text-slate-100 flex flex-col items-center justify-center px-4 py-8 relative">
      {/* Background Institutional Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header with Institutional Branding & Language Toggle */}
      <header className="w-full max-w-md flex items-center justify-between mb-8 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-emerald-glow">
            <Utensils className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <span className="text-[10px] tracking-wider uppercase font-semibold text-emerald-400 block font-mono">
              BUP Hall Dining
            </span>
            <span className="text-sm font-bold text-slate-100 font-bengali">
              {t.common.appName}
            </span>
          </div>
        </div>

        {/* Full Language Switcher */}
        <LanguageToggle />
      </header>

      {/* Main Glass Card Form Container */}
      <main className="w-full max-w-md z-10">
        <div className="glass-card p-6 sm:p-8 border border-slate-800/80 shadow-2xl relative">
          <AnimatePresence mode="wait">
            {step === "input" ? (
              /* ========================================================
               * STEP 1: Email or Phone Number Input
               * ======================================================== */
              <motion.div
                key="step-input"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div>
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{isBengali ? "শিক্ষার্থী প্রবেশ পোর্টাল" : "Student Access Portal"}</span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-100 font-bengali">
                    {t.auth.loginTitle}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1 font-bengali leading-relaxed">
                    {t.auth.loginSubtitle}
                  </p>
                </div>

                {/* 1. Universal Google OAuth Button */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm shadow-xl flex items-center justify-center space-x-3 transition-all duration-200 active:scale-[0.99] disabled:opacity-70 cursor-pointer border border-slate-200"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.28 21.42 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.25C.45 8.18 0 10.03 0 12s.45 3.82 1.25 5.42l4.03-3.13z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.28 2.58 1.25 6.58l4.03 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  <span className="font-sans">
                    {isBengali ? "গুগল দিয়ে সরাসরি প্রবেশ করুন" : "Continue with Google"}
                  </span>
                </button>

                {/* Aesthetic Divider */}
                <div className="relative flex items-center justify-center my-2">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="bg-slate-900/90 px-3 text-[11px] text-slate-500 uppercase tracking-wider font-mono">
                    {isBengali ? "অথবা ইমেইল / ওটিপি" : "Or use Email / Phone OTP"}
                  </span>
                </div>

                {/* Login Method Tabs: Email vs Phone Number */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("email");
                      setInputError(null);
                      setGeneralError(null);
                    }}
                    className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                      authMode === "email"
                        ? "bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-950/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span className="font-bengali">{t.auth.loginWithEmail}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("phone");
                      setInputError(null);
                      setGeneralError(null);
                    }}
                    className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                      authMode === "phone"
                        ? "bg-emerald-600 text-slate-950 font-bold shadow-md shadow-emerald-950/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span className="font-bengali">{t.auth.loginWithPhone}</span>
                  </button>
                </div>

                <form onSubmit={handleSendOtp} className="space-y-4">
                  {/* Email Input Field */}
                  {authMode === "email" ? (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                        <span>{t.auth.emailLabel}</span>
                        <span className="text-[11px] font-mono text-emerald-400">@student.bup.edu.bd / @bup.edu.bd / any email</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          autoFocus
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (inputError) setInputError(null);
                          }}
                          placeholder={t.auth.emailPlaceholder}
                          className={`w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border text-slate-100 text-sm font-sans placeholder:text-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            inputError
                              ? "border-rose-500/80 focus:ring-rose-500"
                              : "border-slate-800 hover:border-slate-700"
                          }`}
                        />
                      </div>

                      {/* Educational Institutional Verification Indicator */}
                      {email && (
                        <motion.div
                          initial={{ opacity: 0, y: -2 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex items-start space-x-1.5 text-[11px] p-2 rounded-lg border leading-tight ${
                            isEdu
                              ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                              : "bg-amber-950/20 border-amber-500/30 text-amber-300"
                          }`}
                        >
                          {isEdu ? (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <span className="font-bengali">{t.auth.eduEmailBadge}</span>
                            </>
                          ) : (
                            <>
                              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                              <span className="font-bengali">{t.auth.nonEduEmailNotice}</span>
                            </>
                          )}
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    /* Phone Number Input Field */
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 font-bengali flex items-center justify-between">
                        <span>{t.auth.phoneNumber}</span>
                        <span className="text-[11px] font-mono text-emerald-400">01XXXXXXXXX</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Phone className="w-4 h-4" />
                        </div>
                        <input
                          type="tel"
                          required
                          autoFocus
                          value={phoneNumber}
                          onChange={(e) => {
                            setPhoneNumber(e.target.value);
                            if (inputError) setInputError(null);
                          }}
                          placeholder={t.auth.phoneNumberPlaceholder}
                          className={`w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950 border text-slate-100 text-sm font-mono placeholder:text-slate-600 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            inputError
                              ? "border-rose-500/80 focus:ring-rose-500"
                              : "border-slate-800 hover:border-slate-700"
                          }`}
                        />
                      </div>

                      {/* Notice that phone login requires manual approval */}
                      <div className="flex items-start space-x-1.5 text-[11px] p-2 rounded-lg bg-amber-950/20 border border-amber-500/30 text-amber-300 leading-tight">
                        <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span className="font-bengali">{t.auth.nonEduEmailNotice}</span>
                      </div>
                    </div>
                  )}

                  {/* Input Validation Error */}
                  {inputError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center space-x-1.5 text-xs text-rose-400 pt-1 font-bengali"
                    >
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{inputError}</span>
                    </motion.div>
                  )}

                  {/* General / Rate-limit Error */}
                  {generalError && (
                    <div className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/60 p-2.5 rounded-xl font-bengali">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{generalError}</span>
                    </div>
                  )}

                  {/* Submit "Send OTP" Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-emerald-glow flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed font-bengali"
                  >
                    {isLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>{t.auth.sendingOtp}</span>
                      </div>
                    ) : (
                      <>
                        <span>{t.auth.sendOtp}</span>
                        <ArrowRight className="w-4 h-4 text-slate-950" />
                      </>
                    )}
                  </button>
                </form>

                {/* Institutional Security Notice */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-center space-x-2 text-[11px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-bengali">
                    {isBengali
                      ? "বিইউপি ছাত্র হল ও ছাত্রী হল ডাইনিং সার্ভিস"
                      : "BUP Male & Female Hall Dining Service"}
                  </span>
                </div>
              </motion.div>
            ) : (
              /* ========================================================
               * STEP 2: 6-Digit OTP Verification Field
               * ======================================================== */
              <motion.div
                key="step-otp"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{isBengali ? "ওটিপি যাচাইকরণ" : "OTP Verification"}</span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-100 font-bengali">
                    {t.auth.otpSentTitle}
                  </h1>
                  <p className="text-xs text-slate-400 mt-1 font-bengali">
                    {authMode === "phone" ? t.auth.phoneOtpSent : t.auth.otpSentSubtitle}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
                    <span className="font-mono text-emerald-400 truncate max-w-[200px]">
                      {authMode === "email" ? email : phoneNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep("input")}
                      className="text-slate-400 hover:text-emerald-400 text-[11px] underline font-bengali transition-colors"
                    >
                      {authMode === "email" ? t.auth.changeEmail : (isBengali ? "নম্বর পরিবর্তন" : "Change Phone")}
                    </button>
                  </div>
                </div>

                {/* Testability Demo OTP Hint */}
                {demoCodeHint && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-300 font-mono flex items-center justify-between">
                    <span>Demo SMS OTP Code: <strong>{demoCodeHint}</strong></span>
                    <button
                      type="button"
                      onClick={() => {
                        const chars = demoCodeHint.split("");
                        setOtp(chars);
                        verifyOtpCode(demoCodeHint);
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold text-[10px]"
                    >
                      Auto-fill
                    </button>
                  </div>
                )}

                {/* 6-Digit OTP Box Fields with Smooth Auto-Advance */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 font-bengali block">
                    {t.auth.otpBoxesLabel}
                  </label>
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                    {otp.map((digit, idx) => (
                      <input
                        key={`otp-${idx}`}
                        ref={otpRefs[idx]}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        onPaste={handleOtpPaste}
                        className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-mono font-bold rounded-xl bg-slate-950 border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                          digit
                            ? "border-emerald-500/80 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                            : "border-slate-800 text-slate-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* General or Expired OTP Error */}
                {generalError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/60 p-2.5 rounded-xl font-bengali"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{generalError}</span>
                  </motion.div>
                )}

                {/* Verify OTP Button */}
                <button
                  type="button"
                  disabled={isLoading || otp.join("").length !== 6}
                  onClick={() => verifyOtpCode()}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-slate-950 font-bold text-sm tracking-wide transition-all shadow-emerald-glow flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed font-bengali"
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>{t.auth.verifyingOtp}</span>
                    </div>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-slate-950" />
                      <span>{t.auth.verifyOtp}</span>
                    </>
                  )}
                </button>

                {/* Resend OTP Cooldown */}
                <div className="flex items-center justify-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                  {isResendActive ? (
                    <div className="flex items-center space-x-1.5 font-bengali">
                      <span>{t.auth.resendIn}:</span>
                      <span className="font-mono text-emerald-400 font-semibold">
                        {resendSeconds}s
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendOtp()}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold font-bengali flex items-center space-x-1.5 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t.auth.resendOtp}</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
