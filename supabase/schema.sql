-- ============================================================================
-- BUP Hall Dining & Meal Management System - PostgreSQL Database Schema
-- Production-Ready Idempotent Migration Script for Supabase
-- Target Halls: BUP Male Hall & BUP Female Hall
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. ENUM TYPES
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('student', 'staff', 'manager', 'admin');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hall_type') THEN
        CREATE TYPE hall_type AS ENUM ('male', 'female');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meal_type') THEN
        CREATE TYPE meal_type AS ENUM ('breakfast', 'lunch', 'dinner');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_method') THEN
        CREATE TYPE verification_method AS ENUM ('qr_scan', 'pin_fallback', 'manual_override');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meal_status') THEN
        CREATE TYPE meal_status AS ENUM ('booked', 'consumed', 'fraud_reported');
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. TABLES DEFINITION
-- ----------------------------------------------------------------------------

-- Table: public.users
-- Stores registered students, dining staff, hall managers, and administrators
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    department VARCHAR(100),
    blood_group VARCHAR(10),
    session VARCHAR(50),
    hall hall_type NOT NULL DEFAULT 'male',
    room_number VARCHAR(20) NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    role user_role NOT NULL DEFAULT 'student',
    profile_photo_url TEXT,
    totp_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(20), 'hex'),
    dining_pin_hash TEXT NOT NULL, -- Hashed with bcrypt/crypt
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    fcm_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column migrations for existing deployments
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session VARCHAR(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hall_serial VARCHAR(10);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) DEFAULT 'google';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_type VARCHAR(50) DEFAULT 'personal_gmail';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_check;

-- Table: public.meal_bookings
-- Stores daily meal preferences per student
CREATE TABLE IF NOT EXISTS public.meal_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    breakfast BOOLEAN NOT NULL DEFAULT FALSE,
    lunch BOOLEAN NOT NULL DEFAULT FALSE,
    dinner BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_booking_date UNIQUE (user_id, booking_date)
);

-- Table: public.meal_logs
-- Immutable ledger recording meal claim verifications at counter
CREATE TABLE IF NOT EXISTS public.meal_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    booking_id UUID NOT NULL REFERENCES public.meal_bookings(id) ON DELETE CASCADE,
    consumed_date DATE NOT NULL,
    meal_type meal_type NOT NULL,
    status meal_status NOT NULL DEFAULT 'consumed',
    verified_by UUID REFERENCES public.users(id), -- Staff or Manager who verified
    method verification_method NOT NULL DEFAULT 'qr_scan',
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_meal_consumption UNIQUE (user_id, consumed_date, meal_type)
);

-- Table: public.fraud_reports
-- Auditing and dispute ledger for proxy dining reports
CREATE TABLE IF NOT EXISTS public.fraud_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_log_id UUID NOT NULL REFERENCES public.meal_logs(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    report_reason TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: public.admin_audit_logs
-- Executive audit trail recording student profile approvals and rejections
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES public.users(id),
    target_user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    student_id VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'approved', 'rejected', 'bulk_approved'
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. PERFORMANCE & LOOKUP INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_student_id ON public.users(student_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_hall ON public.users(hall);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON public.meal_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_user_date ON public.meal_bookings(user_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_logs_date_meal ON public.meal_logs(consumed_date, meal_type);
CREATE INDEX IF NOT EXISTS idx_logs_user_date ON public.meal_logs(user_id, consumed_date);

-- ----------------------------------------------------------------------------
-- 5. AUTOMATED TIMESTAMP UPDATE TRIGGER
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.meal_bookings;
CREATE TRIGGER set_bookings_updated_at
BEFORE UPDATE ON public.meal_bookings
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 6. STRICT BOOKING CUTOFF TRIGGER (10:00 PM BST / 10:10 PM BST Grace Window)
-- ----------------------------------------------------------------------------
-- Business Rule:
-- Students can toggle meals for a target date only until the booking window closes.
-- The official institutional visible deadline is 10:00 PM BST (22:00:00) on the day
-- before the booking date. An internal 10-minute grace window extends cutoff to 22:10:00 BST.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_booking_cutoff()
RETURNS TRIGGER AS $$
DECLARE
    v_bst_now TIMESTAMP;
    v_cutoff_time TIMESTAMP;
    v_user_role user_role;
BEGIN
    -- Allow admins and managers to perform manual overrides
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    IF v_user_role IN ('admin', 'manager') THEN
        RETURN NEW;
    END IF;

    -- Current timestamp in Bangladesh Standard Time (BST, UTC+6)
    v_bst_now := (NOW() AT TIME ZONE 'Asia/Dhaka');

    -- Cutoff deadline: 22:10:00 BST on the day prior to booking_date (including grace period)
    -- If booking for 2026-10-04, cutoff is 2026-10-03 at 22:10:00 BST
    v_cutoff_time := (NEW.booking_date - INTERVAL '1 day' + TIME '22:10:00');

    -- Prevent booking if current time is past the cutoff or if booking is for past/same day after cutoff
    IF v_bst_now > v_cutoff_time THEN
        RAISE EXCEPTION 'BOOKING_WINDOW_CLOSED: Daily meal booking/cancellation window for % closed at 22:00 BST (Grace: 22:10 BST). Current BST: %',
            NEW.booking_date, v_bst_now
            USING ERRCODE = '22000';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS check_meal_booking_cutoff ON public.meal_bookings;
CREATE TRIGGER check_meal_booking_cutoff
BEFORE INSERT OR UPDATE ON public.meal_bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_cutoff();

-- ----------------------------------------------------------------------------
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- Enable RLS across all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;

-- Helper function to fetch current authenticated user's role
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS user_role AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- RLS Policies: public.users
-- ----------------------------------------------------------------------------

-- 1. Read Policy: Students can view their own profile; Staff/Manager/Admin can read all
DROP POLICY IF EXISTS "users_read_policy" ON public.users;
CREATE POLICY "users_read_policy" ON public.users
FOR SELECT USING (
    auth.uid() = id
    OR public.get_auth_role() IN ('staff', 'manager', 'admin')
);

-- 2. Update Policy: Students can update room & phone (cannot elevate role, approval, or secrets)
DROP POLICY IF EXISTS "users_student_update_policy" ON public.users;
CREATE POLICY "users_student_update_policy" ON public.users
FOR UPDATE USING (
    auth.uid() = id
) WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.users WHERE id = auth.uid())
    AND is_approved = (SELECT is_approved FROM public.users WHERE id = auth.uid())
    AND totp_secret = (SELECT totp_secret FROM public.users WHERE id = auth.uid())
);

-- 3. Admin Full Control on users
DROP POLICY IF EXISTS "users_admin_manage_policy" ON public.users;
CREATE POLICY "users_admin_manage_policy" ON public.users
FOR ALL USING (
    public.get_auth_role() IN ('admin', 'manager')
);

-- ----------------------------------------------------------------------------
-- RLS Policies: public.meal_bookings
-- ----------------------------------------------------------------------------

-- 1. Read Policy: Students see their own bookings; Staff/Admin see all
DROP POLICY IF EXISTS "bookings_read_policy" ON public.meal_bookings;
CREATE POLICY "bookings_read_policy" ON public.meal_bookings
FOR SELECT USING (
    auth.uid() = user_id
    OR public.get_auth_role() IN ('staff', 'manager', 'admin')
);

-- 2. Insert Policy: Students can insert their own booking (enforce_booking_cutoff trigger applies)
DROP POLICY IF EXISTS "bookings_insert_policy" ON public.meal_bookings;
CREATE POLICY "bookings_insert_policy" ON public.meal_bookings
FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR public.get_auth_role() IN ('admin', 'manager')
);

-- 3. Update Policy: Students can toggle their own booking before cutoff
DROP POLICY IF EXISTS "bookings_update_policy" ON public.meal_bookings;
CREATE POLICY "bookings_update_policy" ON public.meal_bookings
FOR UPDATE USING (
    auth.uid() = user_id
    OR public.get_auth_role() IN ('admin', 'manager')
) WITH CHECK (
    auth.uid() = user_id
    OR public.get_auth_role() IN ('admin', 'manager')
);

-- ----------------------------------------------------------------------------
-- RLS Policies: public.meal_logs
-- ----------------------------------------------------------------------------

-- 1. Read Policy: Students can view their consumption history; Staff/Admin can view all
DROP POLICY IF EXISTS "logs_read_policy" ON public.meal_logs;
CREATE POLICY "logs_read_policy" ON public.meal_logs
FOR SELECT USING (
    auth.uid() = user_id
    OR public.get_auth_role() IN ('staff', 'manager', 'admin')
);

-- 2. Insert Policy: Strictly staff and admins can record meal verifications
DROP POLICY IF EXISTS "logs_staff_insert_policy" ON public.meal_logs;
CREATE POLICY "logs_staff_insert_policy" ON public.meal_logs
FOR INSERT WITH CHECK (
    public.get_auth_role() IN ('staff', 'manager', 'admin')
);

-- ----------------------------------------------------------------------------
-- RLS Policies: public.fraud_reports
-- ----------------------------------------------------------------------------

-- 1. Read Policy: Reporter sees own reports; Managers and Admins see all
DROP POLICY IF EXISTS "fraud_read_policy" ON public.fraud_reports;
CREATE POLICY "fraud_read_policy" ON public.fraud_reports
FOR SELECT USING (
    auth.uid() = reporter_id
    OR public.get_auth_role() IN ('manager', 'admin')
);

-- 2. Insert Policy: Authenticated users can file fraud report on their own logs
DROP POLICY IF EXISTS "fraud_insert_policy" ON public.fraud_reports;
CREATE POLICY "fraud_insert_policy" ON public.fraud_reports
FOR INSERT WITH CHECK (
    auth.uid() = reporter_id
);

-- 3. Update/Resolve Policy: Only managers and admins can resolve fraud reports
DROP POLICY IF EXISTS "fraud_admin_manage_policy" ON public.fraud_reports;
CREATE POLICY "fraud_admin_manage_policy" ON public.fraud_reports
FOR UPDATE USING (
    public.get_auth_role() IN ('manager', 'admin')
);

-- ----------------------------------------------------------------------------
-- 8. STORAGE BUCKET CONFIGURATION (Private 'avatars' Bucket)
-- ----------------------------------------------------------------------------
-- Create private storage bucket for official student identification photos
-- Max 500KB per asset, restricted to JPEG, PNG, and WebP
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    FALSE, -- Private bucket: served via signed URLs
    524288, -- 500 KB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = 524288,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS: Users can read their own avatar; Staff/Admin can view avatars for verification
DROP POLICY IF EXISTS "avatars_select_policy" ON storage.objects;
CREATE POLICY "avatars_select_policy" ON storage.objects
FOR SELECT USING (
    bucket_id = 'avatars'
    AND (
        auth.uid()::text = (storage.foldername(name))[1]
        OR public.get_auth_role() IN ('staff', 'manager', 'admin')
    )
);

-- Storage RLS: Students can upload only into their own folder (folder name = user_id)
DROP POLICY IF EXISTS "avatars_insert_policy" ON storage.objects;
CREATE POLICY "avatars_insert_policy" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND (
        auth.uid()::text = (storage.foldername(name))[1]
        OR public.get_auth_role() IN ('admin', 'manager')
    )
);
