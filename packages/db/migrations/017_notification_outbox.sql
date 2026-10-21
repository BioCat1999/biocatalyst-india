-- Durable push delivery queue. Ingestion only enqueues; a separate worker
-- performs network delivery and retries, so a push-provider outage cannot
-- slow or roll back catalyst ingestion.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id     UUID NOT NULL UNIQUE REFERENCES alerts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  next_attempt TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_outbox_pending_idx
  ON notification_outbox (next_attempt, created_at)
  WHERE status IN ('pending','failed');
