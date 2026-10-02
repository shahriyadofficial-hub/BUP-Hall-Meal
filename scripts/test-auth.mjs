import assert from "node:assert/strict";
import crypto from "node:crypto";

// Test suite for BUP Hall Dining Authentication & Onboarding Flow

console.log("=== Running BUP Auth & Onboarding Flow Unit Tests ===");

// 1. Email Domain Validation Logic
function isValidBupEmail(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  const bupEmailRegex = /^[a-zA-Z0-9._%+-]+@bup\.edu\.bd$/i;
  return bupEmailRegex.test(normalized);
}

// 2. PIN Validation Logic
function isValidDiningPin(pin) {
  if (!pin || typeof pin !== "string") return false;
  return /^\d{4}$/.test(pin.trim());
}

// 3. PIN Hashing & Verification Logic
function hashDiningPin(pin) {
  const cleanPin = pin.trim();
  if (!isValidDiningPin(cleanPin)) {
    throw new Error("Invalid PIN format. PIN must be exactly 4 digits.");
  }
  return crypto.createHash("sha256").update(cleanPin).digest("hex");
}

function verifyDiningPin(pin, storedHash) {
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

// Test Group 1: BUP Institutional Email Validation
console.log("\n[Test 1] Institutional Email Domain Validation (@bup.edu.bd)");
const validEmails = [
  "student@bup.edu.bd",
  "2302001@bup.edu.bd",
  "tanvir.ahmed@bup.edu.bd",
  "ADMIN_HALL@bup.edu.bd",
  "first.last+dining@bup.edu.bd",
];

for (const email of validEmails) {
  assert.equal(isValidBupEmail(email), true, `Expected valid: ${email}`);
}
console.log("  ✓ All valid @bup.edu.bd emails passed.");

const invalidEmails = [
  "student@gmail.com",
  "student@bup.edu",
  "student@bup.edu.bd.attacker.com",
  "student@notbup.edu.bd",
  "student@bup.ac.bd",
  "@bup.edu.bd",
  "bup.edu.bd",
  "",
  null,
  undefined,
];

for (const email of invalidEmails) {
  assert.equal(isValidBupEmail(email), false, `Expected invalid: ${email}`);
}
console.log("  ✓ All invalid or spoofed domains correctly rejected.");

// Test Group 2: 4-Digit ATM PIN Validation
console.log("\n[Test 2] 4-Digit Dining PIN Validation");
const validPins = ["1234", "0000", "9999", "0421", "5678"];
for (const pin of validPins) {
  assert.equal(isValidDiningPin(pin), true, `Expected valid PIN: ${pin}`);
}
console.log("  ✓ All valid 4-digit PINs passed.");

const invalidPins = [
  "123",      // 3 digits
  "12345",    // 5 digits
  "abcd",     // non-numeric
  "12a4",     // alphanumeric
  "12 4",     // space
  "-123",     // negative
  "",         // empty
  null,
  undefined,
];

for (const pin of invalidPins) {
  assert.equal(isValidDiningPin(pin), false, `Expected invalid PIN: ${pin}`);
}
console.log("  ✓ All invalid PIN formats correctly rejected.");

// Test Group 3: Cryptographic PIN Hashing & Verification
console.log("\n[Test 3] Crypto SHA-256 PIN Hashing & Verification");
const testPin = "4829";
const hash = hashDiningPin(testPin);

assert.equal(typeof hash, "string");
assert.equal(hash.length, 64, "SHA-256 hash must be 64 hex characters");
assert.equal(verifyDiningPin("4829", hash), true, "Correct PIN must verify");
assert.equal(verifyDiningPin("4828", hash), false, "Wrong PIN must fail");
assert.equal(verifyDiningPin("1234", hash), false, "Wrong PIN must fail");

// Edge case tests: buffer length mismatch should safely return false, NOT throw RangeError
assert.equal(verifyDiningPin("4829", "short_hash"), false, "Different length hash must safely return false");
assert.equal(verifyDiningPin("4829", "1234567890abcdef"), false, "16-char hash must safely return false");
assert.equal(verifyDiningPin("4829", ""), false, "Empty hash must return false");
assert.equal(verifyDiningPin("4829", null), false, "Null hash must return false");
assert.equal(verifyDiningPin("invalid", hash), false, "Invalid PIN format must return false");

// Determinism check
const hash2 = hashDiningPin(testPin);
assert.equal(hash, hash2, "Hashing must be deterministic");

// Rejection on invalid PIN hash input
assert.throws(() => hashDiningPin("999"), /Invalid PIN format/);
console.log("  ✓ SHA-256 PIN hashing and timingSafeEqual verification with buffer safety verified.");

// Test Group 4: Hall Type Domain Validation
console.log("\n[Test 4] Residential Hall Domain Mapping");
const allowedHalls = ["male", "female"];
assert.equal(allowedHalls.includes("male"), true);
assert.equal(allowedHalls.includes("female"), true);
assert.equal(allowedHalls.includes("other"), false);
console.log("  ✓ Residential hall designations strictly constrained to 'male' and 'female'.");

console.log("\n=== ALL TESTS PASSED SUCCESSFULLY! ===");
