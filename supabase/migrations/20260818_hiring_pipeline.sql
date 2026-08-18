-- Explicit hiring pipeline lifecycle records.
-- Keeps candidates.stage for compatibility while adding detailed statuses and audit records.

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_at DATE,
  ADD COLUMN IF NOT EXISTS kiv_notes TEXT,
  ADD COLUMN IF NOT EXISTS kiv_follow_up_date DATE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE TABLE IF NOT EXISTS public.candidate_pipeline_history (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  event_type TEXT NOT NULL,
  notes TEXT,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.candidate_interviews (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  meeting_link TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.candidate_evaluations (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  evaluator_name TEXT NOT NULL,
  evaluator_designation TEXT,
  evaluation_date DATE NOT NULL,
  technical_score NUMERIC(4, 2) NOT NULL DEFAULT 0,
  communication_score NUMERIC(4, 2) NOT NULL DEFAULT 0,
  cultural_fit_score NUMERIC(4, 2) NOT NULL DEFAULT 0,
  leadership_score NUMERIC(4, 2) NOT NULL DEFAULT 0,
  overall_recommendation TEXT NOT NULL,
  additional_comments TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(candidate_id)
);

CREATE TABLE IF NOT EXISTS public.candidate_offers (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'preparing',
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response_notes TEXT,
  rejection_reason TEXT,
  UNIQUE(candidate_id)
);

CREATE TABLE IF NOT EXISTS public.candidate_share_links (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.candidate_share_deliveries (
  id TEXT PRIMARY KEY,
  share_link_id TEXT NOT NULL REFERENCES public.candidate_share_links(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  handoff_status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_candidate_pipeline_history_candidate
  ON public.candidate_pipeline_history(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidate_interviews_candidate
  ON public.candidate_interviews(candidate_id, scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_candidate_offers_status
  ON public.candidate_offers(status);
CREATE INDEX IF NOT EXISTS idx_candidate_share_links_candidate
  ON public.candidate_share_links(candidate_id, kind, expires_at);

ALTER TABLE public.candidate_pipeline_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_share_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to candidate_pipeline_history" ON public.candidate_pipeline_history;
CREATE POLICY "Allow all access to candidate_pipeline_history"
  ON public.candidate_pipeline_history FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to candidate_interviews" ON public.candidate_interviews;
CREATE POLICY "Allow all access to candidate_interviews"
  ON public.candidate_interviews FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to candidate_evaluations" ON public.candidate_evaluations;
CREATE POLICY "Allow all access to candidate_evaluations"
  ON public.candidate_evaluations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to candidate_offers" ON public.candidate_offers;
CREATE POLICY "Allow all access to candidate_offers"
  ON public.candidate_offers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to candidate_share_links" ON public.candidate_share_links;
CREATE POLICY "Allow all access to candidate_share_links"
  ON public.candidate_share_links FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all access to candidate_share_deliveries" ON public.candidate_share_deliveries;
CREATE POLICY "Allow all access to candidate_share_deliveries"
  ON public.candidate_share_deliveries FOR ALL USING (true) WITH CHECK (true);
