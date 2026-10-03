-- ============================================================================
-- BUP Hall Meal - RBAC, Onboarding Status, and Monthly Meal Logs Migration
-- ============================================================================

-- Roles enum and users columns
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'staff', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ensure enum values exist if type was created earlier
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'student';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS is_onboarded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hall_serial integer;

-- Update existing onboarded users
UPDATE public.users 
SET is_onboarded = true 
WHERE student_id IS NOT NULL AND is_onboarded IS NOT TRUE;

-- Monthly meal bookings & logs
CREATE TABLE IF NOT EXISTS public.meal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  meal_date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  status text NOT NULL CHECK (status IN ('booked', 'consumed', 'cancelled')) DEFAULT 'booked',
  claimed_at timestamptz,
  claimed_by uuid REFERENCES public.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, meal_date, meal_type)
);

-- Ensure columns exist in case table was pre-existing
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS meal_date date DEFAULT CURRENT_DATE;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS claimed_by uuid REFERENCES public.users(id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_logs' AND column_name = 'consumed_date') THEN
    UPDATE public.meal_logs SET meal_date = consumed_date WHERE meal_date IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meal_logs' AND column_name = 'consumed_at') THEN
    UPDATE public.meal_logs SET claimed_at = consumed_at WHERE claimed_at IS NULL;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

-- Base Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Staff and Admins can view all users" ON public.users;
CREATE POLICY "Staff and Admins can view all users" ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('staff', 'admin'))
);

DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
CREATE POLICY "Admins can update all users" ON public.users FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Students view own meal logs" ON public.meal_logs;
CREATE POLICY "Students view own meal logs" ON public.meal_logs FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff and Admin view all meal logs" ON public.meal_logs;
CREATE POLICY "Staff and Admin view all meal logs" ON public.meal_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('staff', 'admin'))
);
