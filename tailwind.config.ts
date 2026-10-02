import type { Config } from "tailwindcss";

/**
 * Tailwind CSS Configuration for BUP Hall Dining & Meal Management System
 * 
 * Aesthetic Philosophy:
 * - Institutional Dark Palette: Obsidian slate base (#0b0f17) tailored for high-contrast mobile PWA usage.
 * - Elevated Glass Cards: Subtle slate-900/70 surface elevation with border-slate-800/80 and frosted glass backdrop blur.
 * - Brand Accents: Institutional emerald greens (#059669 / #10b981) representing BUP hall identity and active verification.
 * - Alert Highlights: Rose-500 (#f43f5e) for duplicate claims/fraud, Amber-500 (#f59e0b) for booking locks & countdowns.
 * - Bilingual Typography: Google Font 'Hind Siliguri' for native Bengali and 'Inter' for alphanumeric tabular digits.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/context/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep obsidian institutional canvas background
        obsidian: {
          950: "#0b0f17",
          900: "#0f172a",
          850: "#131c31",
          800: "#1e293b",
        },
        // Institutional Emerald brand accent colors
        bup: {
          emerald: {
            400: "#34d399",
            500: "#10b981",
            600: "#059669",
            700: "#047857",
            glow: "rgba(16, 185, 129, 0.15)",
          },
          gold: {
            500: "#f59e0b",
            glow: "rgba(245, 158, 11, 0.15)",
          },
          crimson: {
            500: "#f43f5e",
            glow: "rgba(244, 63, 94, 0.15)",
          }
        },
      },
      fontFamily: {
        // Bengali font family (Hind Siliguri) loaded via Next.js Google font variable
        bengali: ["var(--font-hind-siliguri)", "sans-serif"],
        // Inter font family for alphanumeric tokens, pins, and timestamps
        sans: ["var(--font-inter)", "var(--font-hind-siliguri)", "sans-serif"],
      },
      boxShadow: {
        "emerald-glow": "0 0 25px -5px rgba(16, 185, 129, 0.25)",
        "crimson-glow": "0 0 25px -5px rgba(244, 63, 94, 0.25)",
        "amber-glow": "0 0 25px -5px rgba(245, 158, 11, 0.25)",
        "kiosk-card": "0 8px 32px 0 rgba(0, 0, 0, 0.45)",
      },
      animation: {
        "pulse-subtle": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "qr-scan": "scan 2s linear infinite",
      },
      keyframes: {
        scan: {
          "0%, 100%": { transform: "translateY(0%)" },
          "50%": { transform: "translateY(100%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
