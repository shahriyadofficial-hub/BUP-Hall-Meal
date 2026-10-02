"use client";

import React from "react";
import { Globe } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "@/context/LocaleContext";

/**
 * LanguageToggle Component
 * 
 * A sleek, pill-shaped language switcher meeting BUP institutional UI requirements:
 * - Uses the full word "বাংলা" written in Bengali script (not abbreviated) and "English".
 * - Features a smooth sliding indicator animated by Framer Motion.
 * - Delivers 25ms tactile haptic feedback on mobile touch screens via navigator.vibrate.
 * - Accessible with proper aria attributes for screen readers.
 */
export const LanguageToggle: React.FC = () => {
  const { locale, setLocale, toggleLocale, isBengali } = useTranslation();

  /**
   * Triggers a subtle tactile haptic vibration (25ms) on supporting mobile hardware
   */
  const triggerHapticFeedback = () => {
    if (typeof window !== "undefined" && "navigator" in window && navigator.vibrate) {
      try {
        navigator.vibrate(25);
      } catch {
        // Silently fail if vibration permissions are blocked
      }
    }
  };

  const handleSelect = (targetLocale: "bn" | "en") => {
    if (locale !== targetLocale) {
      triggerHapticFeedback();
      setLocale(targetLocale);
    }
  };

  return (
    <div
      role="group"
      aria-label="Language Selector / ভাষা নির্বাচন"
      className="relative inline-flex items-center p-1 rounded-full bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-inner select-none transition-all duration-200"
    >
      {/* Globe Icon */}
      <div className="pl-2 pr-1.5 text-slate-400 flex items-center justify-center">
        <Globe className="w-3.5 h-3.5 text-emerald-500/80 transition-transform duration-300 hover:rotate-45" />
      </div>

      {/* Toggle Buttons Container */}
      <div className="relative flex items-center space-x-1 text-xs font-medium">
        {/* Bengali Option ("বাংলা" in full Bengali script) */}
        <button
          type="button"
          onClick={() => handleSelect("bn")}
          aria-pressed={isBengali}
          className={`relative z-10 px-3 py-1.5 rounded-full transition-colors duration-200 font-bengali font-semibold tracking-wide ${
            isBengali ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          বাংলা
        </button>

        {/* English Option ("English") */}
        <button
          type="button"
          onClick={() => handleSelect("en")}
          aria-pressed={!isBengali}
          className={`relative z-10 px-3 py-1.5 rounded-full transition-colors duration-200 font-sans tracking-wide ${
            !isBengali ? "text-emerald-400 font-semibold" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          English
        </button>

        {/* Sliding Motion Pill Background */}
        <motion.div
          className="absolute top-0 bottom-0 rounded-full bg-emerald-500/15 border border-emerald-500/30 shadow-emerald-glow"
          layout
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
          style={{
            left: isBengali ? "0px" : "calc(50% + 2px)",
            width: "calc(50% - 2px)",
            height: "100%",
          }}
        />
      </div>
    </div>
  );
};

export default LanguageToggle;
