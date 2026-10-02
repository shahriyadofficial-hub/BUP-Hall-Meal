import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import { LocaleProvider } from "@/context/LocaleContext";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import "./globals.css";

/**
 * Hind Siliguri Font configuration for native Bengali typography
 * Weights: 400 (Regular), 500 (Medium), 600 (Semi-bold), 700 (Bold)
 */
const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind-siliguri",
  display: "swap",
});

/**
 * Inter Font configuration for English alphanumeric numbers, tables, and system labels
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Mobile-First PWA Viewport Configuration
 */
export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Application Metadata
 */
export const metadata: Metadata = {
  title: "BUP Hall Dining & Meal Management System | বিইউপি হল ডাইনিং",
  description:
    "Mobile-first PWA for BUP Male Hall and BUP Female Hall dining management, dynamic QR verification, and meal booking.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BUP Dining",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * Root Layout Component
 * 
 * Sets up font variables, dark background base (#0b0f17), and wraps
 * the entire tree with LocaleProvider for instant bilingual toggling.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="bn"
      className={`${hindSiliguri.variable} ${inter.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-obsidian-950 text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
        <LocaleProvider>
          {children}
          <PWAInstallPrompt />
        </LocaleProvider>
      </body>
    </html>
  );
}
