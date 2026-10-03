-- ============================================================================
-- BUP Hall Dining & Meal Management System
-- Migration: 01_core_schema.sql
-- Purpose : Idempotent core schema — tables, ENUMs, RLS policies, and test-
--           account helper snippet.  Safe to run multiple times (all DDL is
--           guarded with IF NOT EXISTS or ADD COLUMN IF NOT EXISTS).
--
-- Target DB: Supabase (PostgreSQL 15+)
-- Run via  : Supabase Dashboard → SQL Editor → Paste → Run
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ---------------------------------------------------------------------------
-- 2. ENUM TYPES  (idempotent guard)
-- ---------------------------------------------------------------------------

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
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meal_status') THEN
        CREATE TYPE meal_status AS ENUM ('booked', 'consumed', 'cancelled', 'fraud_reported');
    END IF;
END $$;

-- Add 'cancelled' label to meal_status if it was created without it
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'cancelled'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'meal_status')
    ) THEN
        ALTER TYPE meal_status ADD VALUE IF NOT EXISTS 'cancelled';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_method') THEN
        CREATE TYPE verification_method AS ENUM ('qr_scan', 'pin_fallback', 'manual_override');
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. TABLE: public.users
--    Primary registry for students, dining staff, managers, and admins.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    -- Primary key mirrors auth.users.id so Supabase RLS auth.uid() works directly
    id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- BUP institutional identity
    student_id       VARCHAR(20)  UNIQUE,          -- e.g. "2302001"; NULL for non-student roles
    full_name        VARCHAR(120) NOT NULL,
    email            VARCHAR(150) UNIQUE NOT NULL,
    avatar_url       TEXT,                          -- profile / passport photo URL (Supabase Storage)
    profile_photo_url TEXT,                         -- alias kept for backward-compat with existing code

    -- Hall assignment
    hall             hall_type    NOT NULL DEFAULT 'male',
    hall_serial      INTEGER      UNIQUE,           -- unique sequential seat / serial number per hall
    room_number      VARCHAR(20),

    -- Academic
    department       VARCHAR(100),
    blood_group      VARCHAR(10),
    session          VARCHAR(50),                   -- e.g. "2023-2024"

    -- Contact & verification
    phone_number     VARCHAR(20),
    phone_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
    auth_provider    VARCHAR(50)  DEFAULT 'email',

    -- Access control
    role             user_role    NOT NULL DEFAULT 'student',
    is_approved      BOOLEAN      NOT NULL DEFAULT FALSE,
    is_onboarded     BOOLEAN      NOT NULL DEFAULT FALSE, -- true after onboarding wizard completes

    -- Dining security
    totp_secret      TEXT         NOT NULL DEFAULT encode(gen_random_bytes(20), 'hex'),
    dining_pin_hash  TEXT,                          -- bcrypt hash of 4-digit backup PIN
    fcm_token        TEXT,                          -- Firebase Cloud Messaging push token

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Idempotent column additions for incremental deployments
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url        TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS hall_serial        INTEGER;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_onboarded       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider       VARCHAR(50) DEFAULT 'email';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dining_pin_hash     TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fcm_token           TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS blood_group         VARCHAR(10);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS session             VARCHAR(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department          VARCHAR(100);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_verified      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS room_number         VARCHAR(20);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_number        VARCHAR(20);

-- hall_serial must be unique (safe no-op if constraint already exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_hall_serial_key'
    ) THEN
        ALTER TABLE public.users ADD CONSTRAINT users_hall_serial_key UNIQUE (hall_serial);
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 4. TABLE: public.meal_bookings
--    Daily per-student meal preference (booked the night before).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_bookings (
    id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID  NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    booking_date DATE  NOT NULL,
    breakfast    BOOLEAN NOT NULL DEFAULT FALSE,
    lunch        BOOLEAN NOT NULL DEFAULT FALSE,
    dinner       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_booking_date UNIQUE (user_id, booking_date)
);


-- ---------------------------------------------------------------------------
-- 5. TABLE: public.meal_logs
--    Immutable ledger — one row per meal claim verified at the counter.
--    Mirrors the status enum required by the task spec ('booked', 'consumed',
--    'cancelled') plus existing 'fraud_reported' value.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    booking_id   UUID        REFERENCES public.meal_bookings(id) ON DELETE SET NULL,
    meal_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
    meal_type    meal_type   NOT NULL,
    status       meal_status NOT NULL DEFAULT 'booked',
    claimed_at   TIMESTAMPTZ,                  -- set when status transitions to 'consumed'
    verified_by  UUID        REFERENCES public.users(id),   -- counter staff uid
    method       verification_method NOT NULL DEFAULT 'qr_scan',
    -- deprecated alias kept for backward-compat; prefer meal_date
    consumed_date DATE        GENERATED ALWAYS AS (meal_date) STORED,
    consumed_at   TIMESTAMPTZ GENERATED ALWAYS AS (claimed_at) STORED,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_meal_consumption UNIQUE (user_id, meal_date, meal_type)
);

-- ---------------------------------------------------------------------------
-- 6. TABLE: public.fraud_reports  (unchanged, idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fraud_reports (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_log_id    UUID NOT NULL REFERENCES public.meal_logs(id) ON DELETE CASCADE,
    reporter_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    report_reason  TEXT NOT NULL,
    resolved       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 7. INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_student_id    ON public.users(student_id);
CREATE INDEX IF NOT EXISTS idx_users_email         ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_hall          ON public.users(hall);
CREATE INDEX IF NOT EXISTS idx_users_role          ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_bookings_date       ON public.meal_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_user_date  ON public.meal_bookings(user_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_logs_date_meal      ON public.meal_logs(meal_date, meal_type);
CREATE INDEX IF NOT EXISTS idx_logs_user_date      ON public.meal_logs(user_id, meal_date);


-- ---------------------------------------------------------------------------
-- 8. AUTO-UPDATED TIMESTAMP TRIGGER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_users_updated_at    ON public.users;
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.meal_bookings;
CREATE TRIGGER set_bookings_updated_at
    BEFORE UPDATE ON public.meal_bookings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 9. BOOKING CUTOFF ENFORCEMENT TRIGGER (22:00 BST visible / 22:10 grace)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_booking_cutoff()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_bst_now     TIMESTAMP;
    v_cutoff_time TIMESTAMP;
    v_user_role   user_role;
BEGIN
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    IF v_user_role IN ('admin', 'manager') THEN RETURN NEW; END IF;

    v_bst_now     := (NOW() AT TIME ZONE 'Asia/Dhaka');
    v_cutoff_time := (NEW.booking_date - INTERVAL '1 day' + TIME '22:10:00');

    IF v_bst_now > v_cutoff_time THEN
        RAISE EXCEPTION 'BOOKING_WINDOW_CLOSED: cutoff for % was 22:10 BST. Current BST: %',
            NEW.booking_date, v_bst_now
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_meal_booking_cutoff ON public.meal_bookings;
CREATE TRIGGER check_meal_booking_cutoff
    BEFORE INSERT OR UPDATE ON public.meal_bookings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_cutoff();


-- ---------------------------------------------------------------------------
-- 10. ENABLE ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 11. HELPER: current user's role (used in policy expressions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$;


-- ---------------------------------------------------------------------------
-- 12. RLS POLICIES — public.users
-- ---------------------------------------------------------------------------

-- Students: read & update their own row only
DROP POLICY IF EXISTS "users_student_read"   ON public.users;
CREATE POLICY "users_student_read" ON public.users
    FOR SELECT USING (
        auth.uid() = id
        OR public.get_auth_role() IN ('staff', 'manager', 'admin')
    );

DROP POLICY IF EXISTS "users_student_update" ON public.users;
CREATE POLICY "users_student_update" ON public.users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        -- Prevent privilege escalation: role, approval, and totp_secret are immutable by student
        AND role        = (SELECT role        FROM public.users WHERE id = auth.uid())
        AND is_approved = (SELECT is_approved FROM public.users WHERE id = auth.uid())
        AND totp_secret = (SELECT totp_secret FROM public.users WHERE id = auth.uid())
    );

-- Staff & admin: full read across all users (needed for counter lookups)
DROP POLICY IF EXISTS "users_staff_read"   ON public.users;
CREATE POLICY "users_staff_read" ON public.users
    FOR SELECT USING (
        public.get_auth_role() IN ('staff', 'admin', 'manager')
    );

-- Admin: full DML control
DROP POLICY IF EXISTS "users_admin_all"    ON public.users;
CREATE POLICY "users_admin_all" ON public.users
    FOR ALL USING (
        public.get_auth_role() IN ('admin', 'manager')
    );

-- Allow new users to insert their own row during onboarding
DROP POLICY IF EXISTS "users_insert_own"   ON public.users;
CREATE POLICY "users_insert_own" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- 13. RLS POLICIES — public.meal_bookings
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "bookings_student_read"   ON public.meal_bookings;
CREATE POLICY "bookings_student_read" ON public.meal_bookings
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.get_auth_role() IN ('staff', 'manager', 'admin')
    );

DROP POLICY IF EXISTS "bookings_student_insert" ON public.meal_bookings;
CREATE POLICY "bookings_student_insert" ON public.meal_bookings
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        OR public.get_auth_role() IN ('admin', 'manager')
    );

DROP POLICY IF EXISTS "bookings_student_update" ON public.meal_bookings;
CREATE POLICY "bookings_student_update" ON public.meal_bookings
    FOR UPDATE USING (
        auth.uid() = user_id
        OR public.get_auth_role() IN ('admin', 'manager')
    ) WITH CHECK (
        auth.uid() = user_id
        OR public.get_auth_role() IN ('admin', 'manager')
    );


-- ---------------------------------------------------------------------------
-- 14. RLS POLICIES — public.meal_logs
-- ---------------------------------------------------------------------------

-- Students: read their own consumption history
DROP POLICY IF EXISTS "logs_student_read"    ON public.meal_logs;
CREATE POLICY "logs_student_read" ON public.meal_logs
    FOR SELECT USING (
        auth.uid() = user_id
        OR public.get_auth_role() IN ('staff', 'manager', 'admin')
    );

-- Staff & admin: full read/write (counter verification inserts logs)
DROP POLICY IF EXISTS "logs_staff_write"     ON public.meal_logs;
CREATE POLICY "logs_staff_write" ON public.meal_logs
    FOR ALL USING (
        public.get_auth_role() IN ('staff', 'manager', 'admin')
    );


-- ---------------------------------------------------------------------------
-- 15. RLS POLICIES — public.fraud_reports
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "fraud_reporter_read"  ON public.fraud_reports;
CREATE POLICY "fraud_reporter_read" ON public.fraud_reports
    FOR SELECT USING (
        auth.uid() = reporter_id
        OR public.get_auth_role() IN ('manager', 'admin')
    );

DROP POLICY IF EXISTS "fraud_student_insert" ON public.fraud_reports;
CREATE POLICY "fraud_student_insert" ON public.fraud_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);


-- ===========================================================================
-- 16. TEST ACCOUNT HELPER SNIPPETS
--     Paste the relevant block in the SQL Editor and run after real auth
--     sign-ups have been created (so the auth.users rows exist).
-- ===========================================================================

-- ── A. Promote a staff email to role = 'staff' ──────────────────────────────
--
--   UPDATE public.users
--   SET    role = 'staff', is_approved = TRUE
--   WHERE  email = 'counter.staff@bup.edu.bd';   -- ← replace with real email
--
-- ── B. Promote an admin email ────────────────────────────────────────────────
--
--   UPDATE public.users
--   SET    role = 'admin', is_approved = TRUE
--   WHERE  email = 'hall.admin@bup.edu.bd';       -- ← replace with real email
--
-- ── C. Approve all pending student accounts in bulk (hall admin action) ──────
--
--   UPDATE public.users
--   SET    is_approved = TRUE
--   WHERE  role = 'student' AND is_approved = FALSE;
--
-- ── D. Seed a minimal test student (skip if using the onboarding UI) ─────────
--
--   INSERT INTO public.users (
--       id, student_id, full_name, email, hall, room_number, role,
--       is_approved, is_onboarded, totp_secret, dining_pin_hash
--   ) VALUES (
--       '00000000-0000-0000-0000-000000000001',   -- must match auth.users.id
--       '2302001',
--       'Md. Tanvir Ahmed',
--       'tanvir@bup.edu.bd',
--       'male',
--       '402',
--       'student',
--       TRUE,
--       TRUE,
--       encode(gen_random_bytes(20), 'hex'),
--       crypt('4829', gen_salt('bf'))             -- dining PIN = 4829
--   ) ON CONFLICT (id) DO NOTHING;
--
-- ===========================================================================
-- END OF MIGRATION
-- ===========================================================================
