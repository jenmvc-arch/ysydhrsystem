-- Work & Shift Groups and public holiday records.

CREATE TABLE IF NOT EXISTS public.work_shift_groups (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  weekly_hours_warning BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, name)
);

CREATE TABLE IF NOT EXISTS public.work_shift_group_days (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES public.work_shift_groups(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  day_type TEXT NOT NULL DEFAULT 'rest',
  is_work_day BOOLEAN NOT NULL DEFAULT FALSE,
  actual_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, weekday)
);

CREATE TABLE IF NOT EXISTS public.employee_work_shift_assignments (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES public.work_shift_groups(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.public_holiday_groups (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'national',
  state_code TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, name)
);

CREATE TABLE IF NOT EXISTS public.public_holidays (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES public.public_holiday_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  observed_date DATE,
  year INTEGER NOT NULL,
  notes TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leave_groups
  ADD COLUMN IF NOT EXISTS public_holiday_group_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_work_shift_assignments_employee
  ON public.employee_work_shift_assignments(entity_id, employee_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_public_holidays_group_date
  ON public.public_holidays(entity_id, group_id, holiday_date);

ALTER TABLE public.work_shift_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_shift_group_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_work_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holiday_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to work_shift_groups" ON public.work_shift_groups;
CREATE POLICY "Allow all access to work_shift_groups" ON public.work_shift_groups FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to work_shift_group_days" ON public.work_shift_group_days;
CREATE POLICY "Allow all access to work_shift_group_days" ON public.work_shift_group_days FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to employee_work_shift_assignments" ON public.employee_work_shift_assignments;
CREATE POLICY "Allow all access to employee_work_shift_assignments" ON public.employee_work_shift_assignments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to public_holiday_groups" ON public.public_holiday_groups;
CREATE POLICY "Allow all access to public_holiday_groups" ON public.public_holiday_groups FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to public_holidays" ON public.public_holidays;
CREATE POLICY "Allow all access to public_holidays" ON public.public_holidays FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
