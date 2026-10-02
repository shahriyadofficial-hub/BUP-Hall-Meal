"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { Locale, TranslationDictionary } from "@/types";
import { translations, getDictionary } from "@/lib/i18n";

/**
 * Interface representing the LocaleContext state and exposed actions
 */
interface LocaleContextType {
  locale: Locale;
  t: TranslationDictionary;
  toggleLocale: () => void;
  setLocale: (locale: Locale) => void;
  isBengali: boolean;
}

const STORAGE_KEY = "bup_dining_preferred_locale";
const DEFAULT_LOCALE: Locale = "bn";

// Initialize Context with undefined default to enforce hook usage inside Provider
const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

interface LocaleProviderProps {
  children: ReactNode;
}

/**
 * LocaleProvider Component
 * 
 * Provides global bilingual state across all client components in Next.js 15 App Router.
 * - Defaults natively to Bengali ('bn') as requested for BUP Hall management.
 * - Restores persisted user choice from localStorage on client hydration.
 * - Automatically keeps the HTML document element's `lang` attribute synced.
 */
export const LocaleProvider: React.FC<LocaleProviderProps> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [isMounted, setIsMounted] = useState(false);

  // Synchronize with localStorage once mounted on client browser
  useEffect(() => {
    setIsMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored === "bn" || stored === "en") {
        setLocaleState(stored);
        document.documentElement.lang = stored;
      } else {
        localStorage.setItem(STORAGE_KEY, DEFAULT_LOCALE);
        document.documentElement.lang = DEFAULT_LOCALE;
      }
    } catch {
      // Graceful fallback if localStorage is disabled or restricted in private browsing
      document.documentElement.lang = DEFAULT_LOCALE;
    }
  }, []);

  /**
   * Set locale explicitly and persist to localStorage
   */
  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale;
    } catch {
      // Ignore storage errors on restricted environments
    }
  }, []);

  /**
   * Toggle between Bengali ('bn') and English ('en')
   */
  const toggleLocale = useCallback(() => {
    setLocale(locale === "bn" ? "en" : "bn");
  }, [locale, setLocale]);

  // Memoize active dictionary to avoid unnecessary re-renders
  const t = useMemo(() => getDictionary(locale), [locale]);
  const isBengali = locale === "bn";

  const contextValue = useMemo(
    () => ({
      locale,
      t,
      toggleLocale,
      setLocale,
      isBengali,
    }),
    [locale, t, toggleLocale, setLocale, isBengali]
  );

  return (
    <LocaleContext.Provider value={contextValue}>
      {children}
    </LocaleContext.Provider>
  );
};

/**
 * Custom hook to access bilingual translation dictionary and locale controls
 * 
 * Usage:
 * ```tsx
 * const { locale, t, toggleLocale, isBengali } = useTranslation();
 * return <h1>{t.common.appName}</h1>;
 * ```
 */
export function useTranslation(): LocaleContextType {
  const context = useContext(LocaleContext);
  if (!context) {
    // If used outside provider before mounting, provide safe default dictionary
    return {
      locale: DEFAULT_LOCALE,
      t: translations[DEFAULT_LOCALE],
      toggleLocale: () => {},
      setLocale: () => {},
      isBengali: true,
    };
  }
  return context;
}
