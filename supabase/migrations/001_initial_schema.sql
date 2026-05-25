-- ============================================================
-- Egixia OC Sync — Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- 1. CLIENTS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id                  SERIAL PRIMARY KEY,
  client_key          VARCHAR(64)  NOT NULL UNIQUE,
  name                VARCHAR(255) NOT NULL,
  base_url            VARCHAR(512) NOT NULL,
  user_name           VARCHAR(255) NOT NULL,
  password            VARCHAR(512) NOT NULL,
  client_id           VARCHAR(255) NOT NULL,
  client_secret       VARCHAR(512) NOT NULL,
  primary_color       VARCHAR(7)   NOT NULL DEFAULT '#10b981',
  sync_rules          TEXT,
  batch_size          INTEGER      NOT NULL DEFAULT 10,
  batch_delay_seconds INTEGER      NOT NULL DEFAULT 3,
  is_active           BOOLEAN      NOT NULL DEFAULT FALSE,
  -- token cache (refreshed per Edge Function call)
  cached_token        TEXT,
  token_expires_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. VERIFICATION_LOGS ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_logs (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER REFERENCES public.clients(id) ON DELETE SET NULL,
  total_records       INTEGER NOT NULL DEFAULT 0,
  synced              INTEGER NOT NULL DEFAULT 0,
  not_found           INTEGER NOT NULL DEFAULT 0,
  supplier_not_exists INTEGER NOT NULL DEFAULT 0,
  errors              INTEGER NOT NULL DEFAULT 0,
  execution_time_ms   INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INTEGRATION_LOGS ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  http_method       VARCHAR(10)   NOT NULL DEFAULT 'GET',
  url               VARCHAR(1024) NOT NULL,
  request_headers   TEXT,
  request_body      TEXT,
  http_status_code  INTEGER,
  response_body     TEXT,
  raw_response      TEXT,
  token             VARCHAR(50),
  auth_prefix       VARCHAR(20) DEFAULT 'Bearer',
  status            VARCHAR(20) NOT NULL,
  error_detail      TEXT,
  service_name      VARCHAR(100),
  execution_time_ms INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. INDEXES -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_client_key       ON public.clients(client_key);
CREATE INDEX IF NOT EXISTS idx_clients_is_active        ON public.clients(is_active);
CREATE INDEX IF NOT EXISTS idx_verification_logs_client ON public.verification_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_client  ON public.integration_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_created ON public.integration_logs(created_at DESC);

-- 5. TRIGGER: updated_at on clients --------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. ROW LEVEL SECURITY -------------------------------------------
ALTER TABLE public.clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs  ENABLE ROW LEVEL SECURITY;

-- Anon users can read active clients (needed for clientKey lookup in the main app)
CREATE POLICY "anon_read_active_clients"
  ON public.clients FOR SELECT
  USING (is_active = TRUE);

-- Authenticated @egixia.com admins can manage clients
CREATE POLICY "admin_all_clients"
  ON public.clients FOR ALL
  USING (auth.email() LIKE '%@egixia.com')
  WITH CHECK (auth.email() LIKE '%@egixia.com');

-- Edge functions (service_role) bypass RLS automatically
-- Admins can read/delete integration logs
CREATE POLICY "admin_all_integration_logs"
  ON public.integration_logs FOR ALL
  USING (auth.email() LIKE '%@egixia.com')
  WITH CHECK (auth.email() LIKE '%@egixia.com');

-- Admins can read verification history
CREATE POLICY "admin_read_verification_logs"
  ON public.verification_logs FOR SELECT
  USING (auth.email() LIKE '%@egixia.com');
