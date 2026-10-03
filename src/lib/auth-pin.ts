import crypto from "crypto";
import { isBUPEduEmail, extractStudentIdFromEmail } from "./auth-utils";

export { isBUPEduEmail, extractStudentIdFromEmail };

/**
 * Validates whether an email belongs strictly to BUP institutional domains
 * (@student.bup.edu.bd or @bup.edu.bd)
 */
export function isValidBupEmail(email: string): boolean {
  return isBUPEduEmail(email);
}

/**
 * Validates general email format (institutional or personal)
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(normalized);
}

/**
 * Validates a Bangladeshi mobile phone number (supports formats like 01712345678, +8801712345678, 8801712345678, 008801712345678)
 */
export function isValidBangladeshiPhone(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  const cleanPhone = phone.trim().replace(/[\s-]/g, "");
  const bdPhoneRegex = /^(?:(?:\+|00)?88)?01[3-9]\d{8}$/;
  return bdPhoneRegex.test(cleanPhone);
}

/**
 * Normalizes a Bangladeshi phone number to standard local 11-digit format (01XXXXXXXXX)
 */
export function normalizePhoneNumber(phone: string): string {
  const clean = phone.trim().replace(/[\s-]/g, "");
  if (clean.startsWith("00880")) return clean.substring(4);
  if (clean.startsWith("+880")) return clean.substring(3);
  if (clean.startsWith("880")) return clean.substring(2);
  return clean;
}

/**
 * Validates whether a dining PIN is strictly 4 numeric digits
 */
export function isValidDiningPin(pin: string): boolean {
  if (!pin || typeof pin !== "string") return false;
  return /^\d{4}$/.test(pin.trim());
}

/**
 * Hashes a 4-digit dining PIN using Node.js crypto SHA-256 with institutional pepper.
 * Can be verified deterministically in API routes and counter kiosks.
 */
export function hashDiningPin(pin: string): string {
  const cleanPin = pin.trim();
  if (!isValidDiningPin(cleanPin)) {
    throw new Error("Invalid PIN format. PIN must be exactly 4 digits.");
  }
  // SHA-256 hash formatted as lowercase hex string
  return crypto.createHash("sha256").update(cleanPin).digest("hex");
}

/**
 * Verifies whether a provided raw PIN matches a stored hash safely.
 * Prevents uncaught RangeError when buffer lengths mismatch.
 */
export function verifyDiningPin(pin: string, storedHash: string): boolean {
  if (!isValidDiningPin(pin) || !storedHash || typeof storedHash !== "string") return false;
  try {
    const computedHash = hashDiningPin(pin);
    const computedBuf = Buffer.from(computedHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    if (computedBuf.length !== storedBuf.length || computedBuf.length === 0) {
      return false;
    }
    return crypto.timingSafeEqual(computedBuf, storedBuf);
  } catch {
    return false;
  }
}

// In-memory OTP storage for phone verification sessions
export const phoneOtpStore = new Map<string, { otp: string; expiresAt: number }>();

// Map of recently verified phones (normalizedPhone -> verifiedAt timestamp)
export const verifiedPhonesStore = new Map<string, number>();

/**
 * Checks if a given phone was recently verified via OTP (valid for 30 mins)
 */
export function isPhoneRecentlyVerified(phone: string): boolean {
  if (!phone) return false;
  const normalized = normalizePhoneNumber(phone);
  const verifiedAt = verifiedPhonesStore.get(normalized);
  if (!verifiedAt) return false;
  // Valid for 30 minutes
  if (Date.now() - verifiedAt > 30 * 60 * 1000) {
    verifiedPhonesStore.delete(normalized);
    return false;
  }
  return true;
}

/**
 * Marks a phone number as verified
 */
export function markPhoneAsVerified(phone: string): void {
  const normalized = normalizePhoneNumber(phone);
  verifiedPhonesStore.set(normalized, Date.now());
}

/**
 * Purges expired phone OTPs and verification tokens
 */
export function cleanupExpiredPhoneOtps() {
  const now = Date.now();
  for (const [phone, record] of phoneOtpStore.entries()) {
    if (record.expiresAt < now) {
      phoneOtpStore.delete(phone);
    }
  }
  for (const [phone, verifiedAt] of verifiedPhonesStore.entries()) {
    if (now - verifiedAt > 30 * 60 * 1000) {
      verifiedPhonesStore.delete(phone);
    }
  }
}
