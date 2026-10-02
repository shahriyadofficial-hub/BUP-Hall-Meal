import assert from "node:assert/strict";
import { 
  isValidBupEmail, 
  isValidEmail, 
  isValidBangladeshiPhone, 
  normalizePhoneNumber,
  isPhoneRecentlyVerified, 
  verifiedPhonesStore 
} from "../src/lib/auth-pin.ts";

console.log("=== RUNNING UNIT & LOGIC VERIFICATION TESTS ===");

// 1. Email validation tests
console.log("1. Testing Email Verification...");
assert.equal(isValidBupEmail("student@bup.edu.bd"), true, "BUP email should be valid BUP email");
assert.equal(isValidBupEmail("john.doe@bup.edu.bd"), true, "BUP email with dots should be valid");
assert.equal(isValidBupEmail("student@gmail.com"), false, "Gmail should NOT be valid BUP email");
assert.equal(isValidBupEmail("student@yahoo.com"), false, "Yahoo should NOT be valid BUP email");

assert.equal(isValidEmail("student@bup.edu.bd"), true, "BUP email is a valid general email");
assert.equal(isValidEmail("student@gmail.com"), true, "Gmail is a valid general email");
assert.equal(isValidEmail("user.name+tag@domain.co"), true, "Tagged email is a valid email");
assert.equal(isValidEmail("invalid-email"), false, "Plain string is not a valid email");
assert.equal(isValidEmail("@missingusername.com"), false, "Missing username is not a valid email");
console.log("✓ Email validation tests passed.");

// 2. Phone validation tests (including 0088, +88, and local formats)
console.log("2. Testing Bangladeshi Phone Number Verification...");
assert.equal(isValidBangladeshiPhone("01712345678"), true, "Standard 11-digit 017 number should be valid");
assert.equal(isValidBangladeshiPhone("01812345678"), true, "Standard 11-digit 018 number should be valid");
assert.equal(isValidBangladeshiPhone("01912345678"), true, "Standard 11-digit 019 number should be valid");
assert.equal(isValidBangladeshiPhone("01312345678"), true, "Standard 11-digit 013 number should be valid");
assert.equal(isValidBangladeshiPhone("01412345678"), true, "Standard 11-digit 014 number should be valid");
assert.equal(isValidBangladeshiPhone("01512345678"), true, "Standard 11-digit 015 number should be valid");
assert.equal(isValidBangladeshiPhone("01612345678"), true, "Standard 11-digit 016 number should be valid");
assert.equal(isValidBangladeshiPhone("+8801712345678"), true, "International format +88017 should be valid");
assert.equal(isValidBangladeshiPhone("8801712345678"), true, "Format 88017 should be valid");
assert.equal(isValidBangladeshiPhone("008801712345678"), true, "Format 0088017 should be valid");
assert.equal(isValidBangladeshiPhone("01712-345678"), true, "Hyphenated format should be valid");
assert.equal(isValidBangladeshiPhone("01712 345678"), true, "Spaced format should be valid");

assert.equal(isValidBangladeshiPhone("01212345678"), false, "012 operator is invalid");
assert.equal(isValidBangladeshiPhone("017123456"), false, "Short number is invalid");
assert.equal(isValidBangladeshiPhone("0171234567899"), false, "Overly long number is invalid");
assert.equal(isValidBangladeshiPhone("abcdefghijk"), false, "Alphabetic characters are invalid");
console.log("✓ Phone validation tests passed.");

// 3. Phone normalization tests
console.log("3. Testing Phone Normalization...");
assert.equal(normalizePhoneNumber("+8801712345678"), "01712345678");
assert.equal(normalizePhoneNumber("8801712345678"), "01712345678");
assert.equal(normalizePhoneNumber("008801712345678"), "01712345678");
assert.equal(normalizePhoneNumber("01712345678"), "01712345678");
assert.equal(normalizePhoneNumber("01712-345678"), "01712345678");
assert.equal(normalizePhoneNumber("01712 345678"), "01712345678");
console.log("✓ Phone normalization tests passed.");

// 4. Hall Authority Manual vs Automatic Approval Rule & Anti-Spoofing
console.log("4. Testing Hall Authority Verification Logic & Anti-Spoofing...");
function determineApproval({ authMethod, authenticatedEmail, submittedEmail }) {
  if (authMethod === "phone") {
    // Phone logins ALWAYS require manual hall authority verification
    return false;
  }
  if (authenticatedEmail) {
    // Only approved if authenticated login email was official @bup.edu.bd
    return isValidBupEmail(authenticatedEmail) && isValidBupEmail(submittedEmail);
  }
  return isValidBupEmail(submittedEmail);
}

// Case A: User logged in with official edu email -> Auto-approved
assert.equal(
  determineApproval({
    authMethod: "email",
    authenticatedEmail: "student@bup.edu.bd",
    submittedEmail: "student@bup.edu.bd",
  }),
  true,
  "Official edu email login must be automatically approved"
);

// Case B: User logged in with personal Gmail -> Requires manual hall verification
assert.equal(
  determineApproval({
    authMethod: "email",
    authenticatedEmail: "student@gmail.com",
    submittedEmail: "student@gmail.com",
  }),
  false,
  "Personal Gmail login must require manual Hall authority verification"
);

// Case C: User logged in with phone number -> Requires manual hall verification
assert.equal(
  determineApproval({
    authMethod: "phone",
    authenticatedEmail: null,
    submittedEmail: "student@bup.edu.bd", // attempts spoofing
  }),
  false,
  "Phone login MUST require manual Hall authority verification even if submitted email is edu"
);

// Case D: User authenticated with Gmail but submits spoofed edu email -> Requires manual verification
assert.equal(
  determineApproval({
    authMethod: "email",
    authenticatedEmail: "hacker@gmail.com",
    submittedEmail: "provost@bup.edu.bd",
  }),
  false,
  "Gmail login attempting to submit edu email MUST be rejected from auto-approval"
);
console.log("✓ Hall Authority verification logic and anti-spoofing passed.");

// 5. Phone Verification State Tracking
console.log("5. Testing Server-Side Phone Verification State Store...");
const testPhone = "01799998888";
assert.equal(isPhoneRecentlyVerified(testPhone), false, "Unverified phone must return false");

// Record verification
verifiedPhonesStore.set(testPhone, Date.now());
assert.equal(isPhoneRecentlyVerified(testPhone), true, "Recently verified phone must return true");

// Expired verification (> 30 mins)
verifiedPhonesStore.set(testPhone, Date.now() - 31 * 60 * 1000);
assert.equal(isPhoneRecentlyVerified(testPhone), false, "Expired phone verification must return false");
console.log("✓ Server-side phone verification state tracking passed.");

// 6. Personal Info Fields Validation (Department, Blood Group, Session)
console.log("6. Testing Department, Blood Group, and Session Validation...");
function validatePersonalInfo({ department, customDepartment, bloodGroup, session }) {
  const resolvedDept = department === "Other" ? customDepartment?.trim() : department?.trim();
  const validBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  
  if (!resolvedDept) return { valid: false, error: "Department is required" };
  if (!bloodGroup || !validBloodGroups.includes(bloodGroup.trim())) return { valid: false, error: "Valid blood group is required" };
  if (!session || !session.trim()) return { valid: false, error: "Session is required" };
  
  return { valid: true, department: resolvedDept, bloodGroup: bloodGroup.trim(), session: session.trim() };
}

// Valid standard department
const res1 = validatePersonalInfo({
  department: "Computer Science & Engineering (CSE)",
  bloodGroup: "O+",
  session: "2023-2024",
});
assert.equal(res1.valid, true);
assert.equal(res1.department, "Computer Science & Engineering (CSE)");

// Valid custom "Other" department
const res2 = validatePersonalInfo({
  department: "Other",
  customDepartment: "Aerospace Engineering",
  bloodGroup: "B+",
  session: "2024-2025",
});
assert.equal(res2.valid, true);
assert.equal(res2.department, "Aerospace Engineering");

// Missing custom department
const res3 = validatePersonalInfo({
  department: "Other",
  customDepartment: "   ",
  bloodGroup: "A+",
  session: "2023-2024",
});
assert.equal(res3.valid, false);

// Invalid blood group
const res4 = validatePersonalInfo({
  department: "Economics",
  bloodGroup: "C+",
  session: "2022-2023",
});
assert.equal(res4.valid, false);

// Missing session
const res5 = validatePersonalInfo({
  department: "Economics",
  bloodGroup: "AB+",
  session: "",
});
assert.equal(res5.valid, false);
console.log("✓ Department, Blood Group, and Session validation passed.");

console.log("\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!");
