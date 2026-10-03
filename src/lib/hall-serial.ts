/**
 * BUP Hall Serial Helper Utilities
 * Formats and normalizes short student serial numbers (e.g. 1 to 500)
 */

export function formatHallSerial(serial?: string | number | null, studentId?: string | null): string {
  if (serial !== undefined && serial !== null && String(serial).trim() !== "") {
    const clean = String(serial).replace(/[^0-9]/g, "");
    if (clean) {
      return `#${clean.padStart(3, "0")}`;
    }
    return `#${String(serial).trim()}`;
  }

  // Fallback: derive from student ID's last 3 digits if available
  if (studentId && typeof studentId === "string") {
    const digits = studentId.replace(/[^0-9]/g, "");
    if (digits.length >= 3) {
      return `#${digits.slice(-3)}`;
    }
  }

  return "#001";
}

export function normalizeHallSerial(input: string | number): string {
  const clean = String(input).replace(/[^0-9]/g, "");
  if (!clean) return String(input).trim();
  return clean.padStart(3, "0");
}
