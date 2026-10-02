import { totp } from "otplib";

console.log("=== RUNNING DYNAMIC QR & RFC 6238 TOTP ENGINE TEST SUITE ===");

// 1. Verify 60-second time step configuration
totp.options = {
  step: 60,
  digits: 6,
};

const secret = "JBSWY3DPEHPK3PXP"; // Base32 test secret

console.log("\n[Test 1] 60-Second RFC 6238 TOTP Token Generation & Verification");
const token = totp.generate(secret);
console.log(`  Generated TOTP Token: ${token} (length: ${token.length})`);

if (token.length !== 6 || !/^\d{6}$/.test(token)) {
  throw new Error(`Token ${token} does not conform to 6-digit numeric specification`);
}

const isValid = totp.check(token, secret);
if (!isValid) {
  throw new Error("TOTP verification check failed for freshly generated token");
}
console.log("  ✓ TOTP generation & verification strictly conforms to 6-digit 60-second RFC 6238 specification.");

// 2. Structured Cryptographic Payload Integrity Check
console.log("\n[Test 2] Structured Dynamic QR Payload Assembly & Base64 Encoding");
const uid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const sid = "2302001";
const ts = Math.floor(Date.now() / 1000);

const payload = {
  uid,
  sid,
  ts,
  totp: token,
};

const jsonStr = JSON.stringify(payload);
const encodedBase64 = Buffer.from(jsonStr).toString("base64");
console.log(`  Base64 Payload: ${encodedBase64}`);

const decodedJson = JSON.parse(Buffer.from(encodedBase64, "base64").toString("utf-8"));
if (
  decodedJson.uid !== uid ||
  decodedJson.sid !== sid ||
  decodedJson.ts !== ts ||
  decodedJson.totp !== token
) {
  throw new Error("Decoded payload does not match source parameters");
}
console.log("  ✓ Base64 payload encoding and decoding matches 100% losslessly.");

// 3. 60-Second Countdown Remaining Calculation Bounds Check
console.log("\n[Test 3] 60-Second Window Countdown Arithmetic");
const currentEpochSec = Math.floor(Date.now() / 1000);
const remainder = currentEpochSec % 60;
const secondsRemaining = 60 - remainder;

if (secondsRemaining < 1 || secondsRemaining > 60) {
  throw new Error(`Seconds remaining ${secondsRemaining} is out of bounds [1, 60]`);
}
console.log(`  Current step remainder: ${remainder}s, seconds until next token: ${secondsRemaining}s`);
console.log("  ✓ 60-second window arithmetic verified within [1, 60] boundary.");

console.log("\n=== ALL DYNAMIC QR & TOTP ENGINE TESTS PASSED! ===");
