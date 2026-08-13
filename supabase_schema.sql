-- ====================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR RED POINT REMOTE HR SYSTEM / MEGA HR
-- Paste and execute this script in your Supabase SQL Editor
-- New-project bootstrap only. Existing projects should apply versioned migrations.
-- The legacy anonymous policies below preserve the current HR app behaviour but are
-- not suitable as the final production authorization model.
-- ====================================================================

-- Enable UUID Extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. CORPORATE ENTITIES TABLE
CREATE TABLE IF NOT EXISTS public.corporate_entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    registration_number TEXT,
    address TEXT,
    tax_reference_no TEXT,
    epf_reference_no TEXT,
    socso_reference_no TEXT,
    currency TEXT DEFAULT 'MYR',
    is_active BOOLEAN DEFAULT TRUE,
    logo_url TEXT,
    google_script_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. EMPLOYEES TABLE
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE SET NULL,
    entity_name TEXT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    designation TEXT,
    department TEXT,
    status TEXT DEFAULT 'Active',
    bank_name TEXT,
    account_no TEXT,
    basic_salary NUMERIC(12, 2) DEFAULT 0,
    housing_allowance NUMERIC(12, 2) DEFAULT 0,
    transport_allowance NUMERIC(12, 2) DEFAULT 0,
    overtime NUMERIC(12, 2) DEFAULT 0,
    performance_bonus NUMERIC(12, 2) DEFAULT 0,
    epf_rate_employee NUMERIC(5, 2) DEFAULT 11,
    epf_rate_employer NUMERIC(5, 2) DEFAULT 13,
    socso_employee NUMERIC(10, 2) DEFAULT 0,
    socso_employer NUMERIC(10, 2) DEFAULT 0,
    skbbk_employee NUMERIC(10, 2) DEFAULT 0,
    skbbk_employer NUMERIC(10, 2) DEFAULT 0,
    eis_employee NUMERIC(10, 2) DEFAULT 0,
    eis_employer NUMERIC(10, 2) DEFAULT 0,
    tax_pcb NUMERIC(12, 2) DEFAULT 0,
    unpaid_leave NUMERIC(12, 2) DEFAULT 0,
    hrd_corp NUMERIC(12, 2) DEFAULT 0,
    avatar_url TEXT,
    gender TEXT,
    nric_passport TEXT,
    nationality TEXT,
    contact_number TEXT,
    contact_number_fill_later BOOLEAN NOT NULL DEFAULT FALSE,
    tax_number TEXT,
    epf_number TEXT,
    socso_number TEXT,
    email_fill_later BOOLEAN NOT NULL DEFAULT FALSE,
    employment_type TEXT,
    marital_status TEXT DEFAULT 'Single',
    eligible_for_statutory TEXT DEFAULT 'Yes',
    opt_in_epf BOOLEAN DEFAULT TRUE,
    opt_in_socso BOOLEAN DEFAULT TRUE,
    opt_in_eis BOOLEAN DEFAULT TRUE,
    opt_in_pcb BOOLEAN DEFAULT TRUE,
    enable_lindung24 BOOLEAN DEFAULT FALSE,
    emergency_contact_name TEXT,
    emergency_contact_relation TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_fill_later BOOLEAN NOT NULL DEFAULT FALSE,
    date_of_joined DATE,
    date_of_confirmation DATE,
    probation_duration_months INTEGER,
    probation_extend BOOLEAN NOT NULL DEFAULT FALSE,
    probation_extension_months INTEGER,
    date_of_termination DATE,
    allowance_general NUMERIC(12, 2) DEFAULT 0,
    allowance_transport NUMERIC(12, 2) DEFAULT 0,
    allowance_parking NUMERIC(12, 2) DEFAULT 0,
    allowance_meal NUMERIC(12, 2) DEFAULT 0,
    allowance_accommodation NUMERIC(12, 2) DEFAULT 0,
    allowance_phone NUMERIC(12, 2) DEFAULT 0,
    reimbursement_amount NUMERIC(12, 2) DEFAULT 0,
    reimbursement_desc TEXT,
    bonus_amount NUMERIC(12, 2) DEFAULT 0,
    bonus_desc TEXT,
    commission_amount NUMERIC(12, 2) DEFAULT 0,
    commission_desc TEXT,
    back_pay_amount NUMERIC(12, 2) DEFAULT 0,
    back_pay_desc TEXT,
    aws_amount NUMERIC(12, 2) DEFAULT 0,
    aws_desc TEXT,
    compensation_amount NUMERIC(12, 2) DEFAULT 0,
    compensation_desc TEXT,
    deduction_in_lieu NUMERIC(12, 2) DEFAULT 0,
    deduction_cp38 NUMERIC(12, 2) DEFAULT 0,
    deduction_others NUMERIC(12, 2) DEFAULT 0,
    deduction_others_desc TEXT,
    spouse_name TEXT,
    spouse_nric TEXT,
    spouse_is_working TEXT DEFAULT 'No',
    spouse_company TEXT,
    spouse_position TEXT,
    has_dependants TEXT DEFAULT 'No',
    ic_front_url TEXT,
    ic_back_url TEXT,
    education_cert_url TEXT,
    career_history JSONB DEFAULT '[]'::jsonb,
    dependants JSONB DEFAULT '[]'::jsonb,
    salary_adjustments JSONB DEFAULT '[]'::jsonb,
    historical_payroll_records JSONB DEFAULT '[]'::jsonb,
    effective_dated_profiles JSONB DEFAULT '[]'::jsonb,
    historical_pcb_results JSONB DEFAULT '[]'::jsonb,
    historical_variances JSONB DEFAULT '[]'::jsonb,
    tp1_declarations JSONB DEFAULT '[]'::jsonb,
    tp3_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CANDIDATES TABLE
CREATE TABLE IF NOT EXISTS public.candidates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    designation TEXT,
    department TEXT,
    entity_id TEXT REFERENCES public.corporate_entities(id) ON DELETE SET NULL,
    entity_name TEXT,
    stage TEXT DEFAULT 'Applied',
    progress INTEGER DEFAULT 0,
    date_joined DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. EMPLOYEE PERFORMANCES TABLE
CREATE TABLE IF NOT EXISTS public.performances (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    employee_id TEXT REFERENCES public.employees(id) ON DELETE CASCADE,
    employee_email TEXT,
    review_cycle_id TEXT,
    manager_name TEXT,
    review_status TEXT DEFAULT 'Draft',
    rating NUMERIC(3, 2) DEFAULT 0,
    teamwork_score NUMERIC(3, 2) DEFAULT 0,
    communication_score NUMERIC(3, 2) DEFAULT 0,
    problem_solving_score NUMERIC(3, 2) DEFAULT 0,
    self_evaluation TEXT,
    manager_comments TEXT,
    goals JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PAYROLL RECORDS (2026) TABLE
CREATE TABLE IF NOT EXISTS public.payroll_records_2026 (
    id TEXT PRIMARY KEY,
    employee_email TEXT NOT NULL,
    payroll_month INTEGER NOT NULL,
    payroll_year INTEGER DEFAULT 2026,
    basic_salary NUMERIC(12, 2) DEFAULT 0,
    allowance_general NUMERIC(12, 2) DEFAULT 0,
    allowance_transport NUMERIC(12, 2) DEFAULT 0,
    allowance_parking NUMERIC(12, 2) DEFAULT 0,
    allowance_meal NUMERIC(12, 2) DEFAULT 0,
    allowance_accommodation NUMERIC(12, 2) DEFAULT 0,
    allowance_phone NUMERIC(12, 2) DEFAULT 0,
    overtime NUMERIC(12, 2) DEFAULT 0,
    bonus_amount NUMERIC(12, 2) DEFAULT 0,
    bonus_desc TEXT,
    commission_amount NUMERIC(12, 2) DEFAULT 0,
    commission_desc TEXT,
    back_pay_amount NUMERIC(12, 2) DEFAULT 0,
    back_pay_desc TEXT,
    aws_amount NUMERIC(12, 2) DEFAULT 0,
    aws_desc TEXT,
    compensation_amount NUMERIC(12, 2) DEFAULT 0,
    compensation_desc TEXT,
    reimbursement_amount NUMERIC(12, 2) DEFAULT 0,
    reimbursement_desc TEXT,
    unpaid_leave NUMERIC(12, 2) DEFAULT 0,
    deduction_in_lieu NUMERIC(12, 2) DEFAULT 0,
    deduction_cp38 NUMERIC(12, 2) DEFAULT 0,
    deduction_others NUMERIC(12, 2) DEFAULT 0,
    deduction_others_desc TEXT,
    payslip_descriptions JSONB DEFAULT '{}'::jsonb,
    payout_kind TEXT NOT NULL DEFAULT 'regular',
    is_separate_payout BOOLEAN NOT NULL DEFAULT FALSE,
    statutory_treatment TEXT,
    payout_title TEXT,
    payout_description TEXT,
    line_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
    document_type TEXT,
    compensation_label TEXT,
    display_settings_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    total_allowance NUMERIC(12, 2) DEFAULT 0,
    gross_salary NUMERIC(12, 2) DEFAULT 0,
    epf_employee NUMERIC(12, 2) DEFAULT 0,
    epf_employer NUMERIC(12, 2) DEFAULT 0,
    socso_employee NUMERIC(10, 2) DEFAULT 0,
    socso_employer NUMERIC(10, 2) DEFAULT 0,
    lindung24_employee NUMERIC(10, 2) DEFAULT 0,
    eis_employee NUMERIC(10, 2) DEFAULT 0,
    eis_employer NUMERIC(10, 2) DEFAULT 0,
    tax_pcb NUMERIC(12, 2) DEFAULT 0,
    actual_pcb_deducted NUMERIC(12, 2) DEFAULT 0,
    hrd_corp NUMERIC(12, 2) DEFAULT 0,
    net_salary NUMERIC(12, 2) DEFAULT 0,
    net_pay NUMERIC(12, 2) DEFAULT 0,
    status TEXT DEFAULT 'Draft',
    payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    email TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'Global Administrator',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    employee_email TEXT,
    changed_by TEXT NOT NULL,
    change_type TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ENABLE ROW LEVEL SECURITY (RLS) & PUBLIC POLICIES FOR ANONYMOUS APP ACCESS
ALTER TABLE public.corporate_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- CREATE ALL-ACCESS ANONYMOUS POLICIES (for dev & web app usage)
DROP POLICY IF EXISTS "Allow all access to corporate_entities" ON public.corporate_entities;
CREATE POLICY "Allow all access to corporate_entities" ON public.corporate_entities FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to employees" ON public.employees;
CREATE POLICY "Allow all access to employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to candidates" ON public.candidates;
CREATE POLICY "Allow all access to candidates" ON public.candidates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to performances" ON public.performances;
CREATE POLICY "Allow all access to performances" ON public.performances FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to payroll_records_2026" ON public.payroll_records_2026;
CREATE POLICY "Allow all access to payroll_records_2026" ON public.payroll_records_2026 FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to users" ON public.users;
CREATE POLICY "Allow all access to users" ON public.users FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to audit_logs" ON public.audit_logs;
CREATE POLICY "Allow all access to audit_logs" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);

-- STORAGE BUCKET FOR DOCUMENTS
INSERT INTO storage.buckets (id, name, public) VALUES ('hr-documents', 'hr-documents', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Public Storage Access" ON storage.objects;
CREATE POLICY "Public Storage Access" ON storage.objects FOR ALL USING (bucket_id = 'hr-documents') WITH CHECK (bucket_id = 'hr-documents');
