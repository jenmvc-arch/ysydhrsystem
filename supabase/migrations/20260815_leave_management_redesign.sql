-- Supabase-backed Leave Management redesign.
-- Adds leave types, policies, carry-over settings, leave groups, employee assignments,
-- leave requests, Off in Lieu credits, balance ledger, and payroll deduction audit rows.

CREATE TABLE IF NOT EXISTS public.leave_types (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, code)
);

CREATE TABLE IF NOT EXISTS public.leave_condition_policies (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    deduction_basis TEXT NOT NULL DEFAULT 'calendar_day',
    rounding_rule TEXT NOT NULL DEFAULT 'nearest_half_day',
    proration_rule TEXT NOT NULL DEFAULT 'none',
    entitlement_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    paid_treatment TEXT NOT NULL DEFAULT 'paid',
    excess_leave_handling TEXT NOT NULL DEFAULT 'allow_unpaid',
    payroll_deduction_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    daily_rate_divisor NUMERIC(8, 2),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leave_carryover_settings (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    max_carry_forward_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    expiry_date DATE,
    expiry_after_months INTEGER,
    rule_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leave_groups (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leave_group_items (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES public.leave_groups(id) ON DELETE CASCADE,
    leave_type_id TEXT REFERENCES public.leave_types(id) ON DELETE CASCADE,
    condition_policy_id TEXT REFERENCES public.leave_condition_policies(id) ON DELETE RESTRICT,
    carryover_setting_id TEXT REFERENCES public.leave_carryover_settings(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, leave_type_id)
);

CREATE TABLE IF NOT EXISTS public.employee_leave_group_assignments (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES public.leave_groups(id) ON DELETE CASCADE,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leave_requests (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    leave_type_id TEXT REFERENCES public.leave_types(id) ON DELETE RESTRICT,
    leave_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    source TEXT NOT NULL DEFAULT 'admin',
    payroll_deduction_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payroll_sync_status TEXT NOT NULL DEFAULT 'not_required',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.off_in_lieu_requests (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Draft',
    submission_mode TEXT NOT NULL DEFAULT 'single',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by TEXT,
    expiry_date DATE NOT NULL,
    total_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.off_in_lieu_entries (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    request_id TEXT REFERENCES public.off_in_lieu_requests(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    department TEXT,
    designation TEXT,
    ot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    hours_worked NUMERIC(8, 2) NOT NULL DEFAULT 0,
    eligible_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    expiry_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leave_balance_ledger (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    leave_type_id TEXT REFERENCES public.leave_types(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    source TEXT NOT NULL,
    request_id TEXT,
    effective_date DATE NOT NULL,
    expiry_date DATE,
    amount_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    remaining_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leave_payroll_deductions (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE CASCADE,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_email TEXT NOT NULL,
    leave_request_id TEXT REFERENCES public.leave_requests(id) ON DELETE CASCADE,
    payroll_month INTEGER NOT NULL,
    payroll_year INTEGER NOT NULL,
    deduction_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
    deduction_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    daily_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_types_entity ON public.leave_types(entity_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_entity_employee ON public.leave_requests(entity_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_assignments_employee ON public.employee_leave_group_assignments(entity_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_employee_type ON public.leave_balance_ledger(entity_id, employee_id, leave_type_id);
CREATE INDEX IF NOT EXISTS idx_off_in_lieu_requests_entity ON public.off_in_lieu_requests(entity_id);
CREATE INDEX IF NOT EXISTS idx_leave_payroll_deductions_request ON public.leave_payroll_deductions(leave_request_id);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_condition_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_carryover_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave_group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.off_in_lieu_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.off_in_lieu_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_payroll_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to leave_types" ON public.leave_types;
CREATE POLICY "Allow all access to leave_types" ON public.leave_types FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to leave_condition_policies" ON public.leave_condition_policies;
CREATE POLICY "Allow all access to leave_condition_policies" ON public.leave_condition_policies FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to leave_carryover_settings" ON public.leave_carryover_settings;
CREATE POLICY "Allow all access to leave_carryover_settings" ON public.leave_carryover_settings FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to leave_groups" ON public.leave_groups;
CREATE POLICY "Allow all access to leave_groups" ON public.leave_groups FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to leave_group_items" ON public.leave_group_items;
CREATE POLICY "Allow all access to leave_group_items" ON public.leave_group_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to employee_leave_group_assignments" ON public.employee_leave_group_assignments;
CREATE POLICY "Allow all access to employee_leave_group_assignments" ON public.employee_leave_group_assignments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to leave_requests" ON public.leave_requests;
CREATE POLICY "Allow all access to leave_requests" ON public.leave_requests FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to off_in_lieu_requests" ON public.off_in_lieu_requests;
CREATE POLICY "Allow all access to off_in_lieu_requests" ON public.off_in_lieu_requests FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to off_in_lieu_entries" ON public.off_in_lieu_entries;
CREATE POLICY "Allow all access to off_in_lieu_entries" ON public.off_in_lieu_entries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to leave_balance_ledger" ON public.leave_balance_ledger;
CREATE POLICY "Allow all access to leave_balance_ledger" ON public.leave_balance_ledger FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to leave_payroll_deductions" ON public.leave_payroll_deductions;
CREATE POLICY "Allow all access to leave_payroll_deductions" ON public.leave_payroll_deductions FOR ALL USING (true) WITH CHECK (true);
