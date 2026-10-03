/**
 * BUP Hall Dining System - Authentication & Domain Validation Utilities
 * 
 * Standardized institutional domain validation for BUP students, faculty, and administration.
 */

/**
 * Standardize BUP Domain Validation Helper
 * Matches both username@student.bup.edu.bd (students) and username@bup.edu.bd (staff/administration)
 */
export function isBUPEduEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  // Matches both username@student.bup.edu.bd and username@bup.edu.bd
  return normalized.endsWith("@student.bup.edu.bd") || normalized.endsWith("@bup.edu.bd");
}

/**
 * Extracts student ID from institutional email if present
 * E.g. "25251710025@student.bup.edu.bd" -> "25251710025"
 */
export function extractStudentIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith("@student.bup.edu.bd")) {
    // E.g. "25251710025@student.bup.edu.bd" -> "25251710025"
    const prefix = normalized.split("@")[0];
    return prefix;
  }
  return null;
}
