-- Persist optional onboarding fields and probation confirmation tracking.
ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS contact_number_fill_later BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS socso_number TEXT,
    ADD COLUMN IF NOT EXISTS email_fill_later BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS emergency_contact_fill_later BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS probation_duration_months INTEGER,
    ADD COLUMN IF NOT EXISTS probation_extend BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS probation_extension_months INTEGER;
