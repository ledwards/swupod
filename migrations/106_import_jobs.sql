CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('extract', 'section')),
  request_hash TEXT NOT NULL,
  input JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempt_token UUID,
  attempts INTEGER NOT NULL DEFAULT 0,
  result JSONB,
  http_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS import_jobs_active_request
  ON import_jobs(user_id, kind, request_hash) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS import_jobs_pending ON import_jobs(created_at)
  WHERE status IN ('queued', 'running');
