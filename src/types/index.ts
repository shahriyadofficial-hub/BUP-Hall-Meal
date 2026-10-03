/**
 * BUP Hall Dining & Meal Management System - Type Definitions
 * 
 * Defines domain models, database schemas, API contracts,
 * and localization interfaces for BUP Male Hall and BUP Female Hall.
 */

// ==========================================
// 1. Core Enums and Identifiers
// ==========================================

/**
 * BUP Student Residential Halls
 * Specifically designated for BUP Male Hall and BUP Female Hall.
 */
export type HallType = 'male' | 'female';

/**
 * Roles allowed in the BUP Dining system
 */
export type UserRole = 'student' | 'staff' | 'manager' | 'admin';

/**
 * Daily dining shifts
 */
export type MealType = 'breakfast' | 'lunch' | 'dinner';

/**
 * Multi-tier verification methods used at the hall counter
 */
export type VerificationMethod = 'qr_scan' | 'pin_fallback' | 'manual_override';

/**
 * Status of meal bookings and consumption
 */
export type MealStatus = 'booked' | 'consumed' | 'fraud_reported';

/**
 * Active application language locale
 */
export type Locale = 'bn' | 'en';

// ==========================================
// 2. Database Entities (PostgreSQL / Supabase)
// ==========================================

/**
 * User Entity matching public.users table in Supabase
 */
export interface User {
  id: string;                         // UUID primary key
  student_id: string;                 // BUP Student ID (e.g., "2302001")
  full_name: string;                  // Official Full Name
  email: string;                      // BUP edu mail or personal email
  department?: string;                // Academic department (e.g. CSE, BBA)
  blood_group?: string;               // Blood group (e.g. A+, O+)
  session?: string;                   // Academic session (e.g. 2023-2024)
  hall: HallType;                     // 'male' (BUP Male Hall) or 'female' (BUP Female Hall)
  room_number: string;                // Hall Room Number (e.g., "402")
  phone_number: string;               // Contact Phone Number
  phone_verified?: boolean;           // Phone number SMS OTP verification status
  role: UserRole;                     // Role enum
  profile_photo_url: string | null;   // Stored in Supabase Private Storage
  totp_secret: string;                // Base32 / Hex secret for RFC 6238 TOTP
  dining_pin_hash: string;            // bcrypt / pgcrypto hash of 4-digit PIN
  is_approved: boolean;               // Verified by Hall Provost / Administration (auto for edu mail)
  is_onboarded?: boolean;             // True once student completes initial hall profile setup
  hall_serial?: string;               // Short unique serial (e.g., "042" or "42")
  auth_provider?: string;             // 'google' | 'email' | 'phone'
  avatar_url?: string | null;         // Google avatar or uploaded profile photo
  login_type?: 'bup_edu' | 'personal_gmail'; // Account type classification
  fcm_token?: string | null;          // Web Push / Firebase Cloud Messaging token
  created_at?: string;                // ISO timestamp
  updated_at?: string;                // ISO timestamp
}

/**
 * Daily Meal Booking Entity matching public.meal_bookings table
 */
export interface MealBooking {
  id: string;                         // UUID primary key
  user_id: string;                    // Foreign key referencing users.id
  booking_date: string;               // YYYY-MM-DD
  breakfast: boolean;                 // Flag for Breakfast booking
  lunch: boolean;                     // Flag for Lunch booking
  dinner: boolean;                    // Flag for Dinner booking
  created_at?: string;                // ISO timestamp
  updated_at?: string;                // ISO timestamp
}

/**
 * Auditable Meal Consumption Log matching public.meal_logs table
 */
export interface MealLog {
  id: string;                         // UUID primary key
  user_id: string;                    // Foreign key referencing users.id (Student)
  booking_id: string;                 // Foreign key referencing meal_bookings.id
  consumed_date: string;              // YYYY-MM-DD
  meal_type: MealType;                // 'breakfast' | 'lunch' | 'dinner'
  status: MealStatus;                 // 'consumed' | 'fraud_reported'
  verified_by?: string | null;        // Foreign key referencing users.id (Counter Staff)
  method: VerificationMethod;         // 'qr_scan' | 'pin_fallback' | 'manual_override'
  consumed_at: string;                // ISO timestamp
}

/**
 * Audit & Fraud Report Entity matching public.fraud_reports table
 */
export interface FraudReport {
  id: string;                         // UUID primary key
  meal_log_id: string;                // References meal_logs.id
  reporter_id: string;                // References users.id
  report_reason: string;              // Detailed rationale
  resolved: boolean;                  // Resolution status
  created_at: string;                 // ISO timestamp
}

// ==========================================
// 3. Verification & Anti-Proxy Token Types
// ==========================================

/**
 * Dynamic QR Code Payload refreshed every 30 seconds
 * Encoded as Base64 JSON in the QR canvas
 */
export interface DynamicQRPayload {
  uid: string;                        // Student UUID
  sid: string;                        // Student ID (e.g., "2302001")
  ts: number;                         // Current Unix Epoch timestamp in seconds
  totp: string;                       // Current 6-digit RFC 6238 TOTP code
}

/**
 * Fallback credential payload when phone battery is dead
 */
export interface FallbackPINPayload {
  student_id: string;                 // BUP Student ID
  pin: string;                        // 4-digit student dining PIN
}

/**
 * POST /api/v1/counter/verify Request Payload
 */
export interface CounterVerificationRequest {
  mode: 'qr' | 'pin';
  meal_type: MealType;
  qr_payload?: string;                // Base64 encoded DynamicQRPayload string
  fallback_data?: FallbackPINPayload; // Fallback data when mode === 'pin'
}

/**
 * POST /api/v1/counter/verify Success / Error Response
 */
export interface CounterVerificationResponse {
  success: boolean;
  data?: {
    log_id: string;
    student_id: string;
    full_name: string;
    hall: HallType;
    room_number: string;
    profile_photo_url: string | null;
    claimed_at: string;
    meal_type: MealType;
  };
  error?: string;
  claimed_at?: string;                // Provided if conflict 409 already claimed
}

// ==========================================
// 4. Localization Dictionary Structure
// ==========================================

/**
 * Shape of translation dictionary keys ensuring 100% type safety
 */
export interface TranslationDictionary {
  common: {
    appName: string;
    appSubtitle: string;
    bupTitle: string;
    maleHall: string;
    femaleHall: string;
    language: string;
    loading: string;
    save: string;
    cancel: string;
    confirm: string;
    back: string;
    status: string;
    error: string;
    success: string;
    offlineMode: string;
    onlineMode: string;
  };
  nav: {
    dashboard: string;
    qrPass: string;
    mealBooking: string;
    history: string;
    staffCounter: string;
    logout: string;
  };
  shifts: {
    breakfast: string;
    lunch: string;
    dinner: string;
    breakfastTime: string;
    lunchTime: string;
    dinnerTime: string;
    booked: string;
    notBooked: string;
    consumed: string;
    claimMeal: string;
  };
  bookingRules: {
    visibleCutoffNotice: string;        // Visible institutional rule: 10:00 PM
    actualGraceCutoffNotice: string;    // Backend grace cutoff: 10:10 PM
    cutoffRemaining: string;
    windowClosed: string;
    windowOpen: string;
    bookingInstruction: string;
  };
  qrPass: {
    title: string;
    subtitle: string;
    tokenRefreshingIn: string;
    seconds: string;
    screenshotWarning: string;
    offlineTotpNotice: string;
    backupPinPrompt: string;
    showPin: string;
    hidePin: string;
    pinInstruction: string;
  };
  counter: {
    title: string;
    viewfinderInstruction: string;
    scanning: string;
    manualPinTab: string;
    scanQrTab: string;
    enterStudentId: string;
    enterPin: string;
    verifyButton: string;
    photoMatchWarning: string;
    confirmEntry: string;
    alreadyClaimed: string;
    invalidToken: string;
    noBooking: string;
    verifiedSuccess: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    sendOtp: string;
    sendingOtp: string;
    otpSentTitle: string;
    otpSentSubtitle: string;
    enterOtp: string;
    verifyOtp: string;
    verifyingOtp: string;
    resendOtp: string;
    resendIn: string;
    invalidDomainError: string;
    expiredOtpError: string;
    changeEmail: string;
    otpBoxesLabel: string;
    onboardingTitle: string;
    onboardingSubtitle: string;
    personalDetails: string;
    fullName: string;
    fullNamePlaceholder: string;
    studentId: string;
    studentIdPlaceholder: string;
    department: string;
    departmentPlaceholder: string;
    bloodGroup: string;
    bloodGroupPlaceholder: string;
    session: string;
    sessionPlaceholder: string;
    hall: string;
    maleHall: string;
    femaleHall: string;
    roomNumber: string;
    roomNumberPlaceholder: string;
    phoneNumber: string;
    phoneNumberPlaceholder: string;
    phoneVerification: string;
    verifyPhone: string;
    phoneVerified: string;
    phoneNotVerified: string;
    sendPhoneOtp: string;
    sendingPhoneOtp: string;
    enterPhoneOtp: string;
    confirmPhoneOtp: string;
    phoneOtpSent: string;
    invalidPhoneError: string;
    phoneVerificationRequired: string;
    loginWithEmail: string;
    loginWithPhone: string;
    eduEmailBadge: string;
    nonEduEmailNotice: string;
    manualVerificationReason: string;
    photoUploadTitle: string;
    photoGuideNotice: string;
    dragDropOrCamera: string;
    cameraCapture: string;
    compressing: string;
    photoReady: string;
    reuploadPhoto: string;
    pinSetupTitle: string;
    pinPrompt: string;
    confirmPinPrompt: string;
    pinMismatch: string;
    pinTooltip: string;
    submitOnboarding: string;
    submitting: string;
    allFieldsRequired: string;
    pendingTitle: string;
    pendingStatusBadge: string;
    pendingNotice: string;
    studentDetails: string;
    autoChecking: string;
    approvedRedirecting: string;
    signOut: string;
    refreshStatus: string;
    provostHelp: string;
  };
}

