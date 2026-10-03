"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Building2,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Utensils,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "@/context/LocaleContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { supabase } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, isBengali } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check URL error param on mount
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setErrorMessage(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  // Check existing session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          // Check if profile exists and is onboarded
          const { data: profile } = await supabase
            .from("users")
            .select("id, student_id, role, is_onboarded, room_number")
            .eq("id", session.user.id)
            .maybeSingle();

          if (
            profile &&
            profile.is_onboarded &&
            profile.student_id &&
            !profile.student_id.startsWith("PENDING") &&
            profile.room_number &&
            profile.room_number !== "PENDING"
          ) {
            if (profile.role === "admin") {
              router.push("/admin/users");
            } else if (
              profile.role === "counter" ||
              profile.role === "staff" ||
              profile.role === "manager"
            ) {
              router.push("/counter");
            } else {
              router.push("/student/dashboard");
            }
          } else {
            router.push("/auth/profile-setup");
          }
        }
      } catch (err) {
        console.warn("[Login] Session check error:", err);
      }
    }

    checkSession();
  }, [router]);

  /**
   * Primary Action: Sign in with Google OAuth
   */
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const redirectUrl =
        typeof window !== "undefined"
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

      if (error) {
        throw error;
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isBengali
          ? "গুগল লগইন সম্পন্ন করতে সমস্যা হয়েছে।"
          : "Failed to initialize Google login.";
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Background Decorative Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-[150px] pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between z-10 py-2">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
            <Utensils className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-white font-bengali block">
              বিইউপি ডাইনিং | BUP Dining
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Hall Dining & Meal Management
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <LanguageToggle />
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="max-w-md w-full mx-auto my-auto z-10 py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-slate-900/80 border border-slate-800 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden"
        >
          {/* Top Decorative Institutional Pill */}
          <div className="flex items-center justify-between mb-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
              <Building2 className="w-3.5 h-3.5" />
              <span className="font-bengali">
                {isBengali ? "আবাসিক হল ডাইনিং পোর্টাল" : "Residential Hall Dining"}
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              <span>OAuth 2.0</span>
            </span>
          </div>

          {/* Heading */}
          <div className="space-y-1 mb-6">
            <h1 className="text-2xl font-bold text-white tracking-tight font-bengali">
              {t.auth.loginTitle}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed font-bengali">
              {isBengali
                ? "বিইউপি প্রাতিষ্ঠানিক এডু-মেইল দিয়ে এক ক্লিকে সরাসরি সাইন-ইন করুন।"
                : "Sign in seamlessly with your official BUP institutional email or Google account."}
            </p>
          </div>

          {/* Institutional Edu-Mail Callout */}
          <div className="mb-6 p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-xs space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-300 font-medium">
              <GraduationCap className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="font-bengali font-semibold">
                {isBengali ? "বিইউপি শিক্ষার্থী ও কর্মকর্তা" : "BUP Students & Staff"}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {isBengali ? (
                <>
                  আপনার <span className="font-mono text-emerald-300 font-semibold">@student.bup.edu.bd</span> বা{" "}
                  <span className="font-mono text-emerald-300 font-semibold">@bup.edu.bd</span> অ্যাকাউন্টের মাধ্যমে
                  স্বয়ংক্রিয় দ্রুত অনুমোদন পাওয়া যাবে।
                </>
              ) : (
                <>
                  Accounts ending with{" "}
                  <span className="font-mono text-emerald-300 font-semibold">@student.bup.edu.bd</span> or{" "}
                  <span className="font-mono text-emerald-300 font-semibold">@bup.edu.bd</span> receive instant
                  automatic institutional verification.
                </>
              )}
            </p>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-rose-300 text-xs flex items-start space-x-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMessage}</span>
            </motion.div>
          )}

          {/* Single Primary Action: Continue with Google */}
          <div className="space-y-4">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleGoogleLogin}
              className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-900 font-semibold text-sm shadow-xl shadow-black/40 flex items-center justify-center space-x-3 transition-all duration-200 cursor-pointer border border-slate-200 disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2 text-slate-700">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  <span className="font-sans">
                    {isBengali ? "সংযোগ স্থাপন হচ্ছে..." : "Connecting to Google..."}
                  </span>
                </div>
              ) : (
                <>
                  {/* Google 'G' official vector logo */}
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
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
                  <span className="font-sans text-sm font-semibold tracking-wide">
                    {isBengali ? "গুগল দিয়ে প্রবেশ করুন" : "Continue with Google"}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            <div className="pt-2 text-center">
              <p className="text-[11px] text-slate-500 font-sans leading-relaxed">
                {isBengali
                  ? "প্রথমবার প্রবেশের ক্ষেত্রে আপনার হল প্রোফাইল সেটআপ করতে হবে।"
                  : "First-time sign in will guide you to complete your hall profile setup."}
              </p>
            </div>
          </div>

          {/* Secure Institutional Badge */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isBengali ? "এনক্রিপ্টেড ও নিরাপদ" : "Encrypted & Secure"}</span>
            </div>
            <div className="flex items-center space-x-1 font-mono text-[10px] text-slate-400">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>BUP Dining v1.0</span>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Institutional Footer */}
      <footer className="max-w-md w-full mx-auto text-center text-xs text-slate-400 z-10 py-3 space-y-1">
        <p className="font-bengali font-medium">
          {isBengali
            ? "বাংলাদেশ ইউনিভার্সিটি অব প্রফেশনালস (বিইউপি)"
            : "Bangladesh University of Professionals (BUP)"}
        </p>
        <p className="text-[11px] text-slate-400 font-mono">
          Residential Halls Dining System • Mirpur Cantonment, Dhaka
        </p>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
