import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind classes safely with clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Bengali Numeral Mapping Table
const BENGALI_DIGITS: Record<string, string> = {
  "0": "০",
  "1": "১",
  "2": "২",
  "3": "৩",
  "4": "৪",
  "5": "৫",
  "6": "৬",
  "7": "৭",
  "8": "৮",
  "9": "৯",
};

/**
 * Converts any standard Hindu-Arabic digits in a string or number to Bengali script.
 * 
 * Example:
 * toBengaliDigits("10:00 PM") -> "১০:০০ PM"
 * toBengaliDigits(402) -> "৪০২"
 */
export function toBengaliDigits(input: string | number): string {
  const str = String(input);
  return str.replace(/[0-9]/g, (digit) => BENGALI_DIGITS[digit] || digit);
}

/**
 * Returns current Bangladesh Standard Time (BST, UTC+6) Date object
 */
export function getBangladeshTime(baseDate: Date = new Date()): Date {
  // Convert current UTC time to UTC+6 (Bangladesh Standard Time)
  const utc = baseDate.getTime() + baseDate.getTimezoneOffset() * 60000;
  return new Date(utc + 6 * 3600000);
}

/**
 * Meal Booking Cutoff Status Interface
 */
export interface BookingCutoffStatus {
  isBookingOpen: boolean;              // True if before actual 22:10:00 grace cutoff
  isGraceActive: boolean;              // True if between 22:00:00 and 22:10:00
  hoursRemaining: number;
  minutesRemaining: number;
  secondsRemaining: number;
  formattedRemaining: string;          // e.g. "02:45:12" or "০২:৪৫:১২"
  visibleRuleTime: string;             // "10:00 PM"
  actualCutoffTime: string;            // "10:10 PM"
}

/**
 * Evaluates the daily meal booking cutoff window for next-day dining.
 * 
 * Business Rules:
 * 1. Visible institutional rule: 10:00 PM (22:00 BST). Displayed to students as the strict deadline.
 * 2. Actual system grace window: 10:10 PM (22:10 BST). The backend allows requests until 10:10 PM
 *    to prevent disputes from network lag or clock drift, before throwing HTTP 423 Locked.
 * 
 * @param isBengali - format the countdown in Bengali numerals if true
 */
export function getDailyBookingCutoffStatus(
  now: Date = new Date(),
  isBengali: boolean = false
): BookingCutoffStatus {
  const bstNow = getBangladeshTime(now);

  // Target cutoff for today in BST
  const visibleDeadline = new Date(bstNow);
  visibleDeadline.setHours(22, 0, 0, 0); // 10:00:00 PM

  const graceDeadline = new Date(bstNow);
  graceDeadline.setHours(22, 10, 0, 0);  // 10:10:00 PM

  const nowMs = bstNow.getTime();
  const visibleMs = visibleDeadline.getTime();
  const graceMs = graceDeadline.getTime();

  const isBookingOpen = nowMs < graceMs;
  const isGraceActive = nowMs >= visibleMs && nowMs < graceMs;

  // Calculate remaining time against visible deadline (or 0 if passed)
  let diffMs = Math.max(0, (isBookingOpen ? graceMs : 0) - nowMs);
  if (!isBookingOpen) {
    diffMs = 0;
  }

  const hoursRemaining = Math.floor(diffMs / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const secondsRemaining = Math.floor((diffMs % (1000 * 60)) / 1000);

  const pad = (n: number) => String(n).padStart(2, "0");
  const rawFormatted = `${pad(hoursRemaining)}:${pad(minutesRemaining)}:${pad(secondsRemaining)}`;
  const formattedRemaining = isBengali ? toBengaliDigits(rawFormatted) : rawFormatted;

  return {
    isBookingOpen,
    isGraceActive,
    hoursRemaining,
    minutesRemaining,
    secondsRemaining,
    formattedRemaining,
    visibleRuleTime: isBengali ? "রাত ১০:০০ টা" : "10:00 PM",
    actualCutoffTime: isBengali ? "রাত ১০:১০ টা" : "10:10 PM",
  };
}
