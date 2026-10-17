-- Read-path indexes for the mobile feed and private notification center.
-- These match the ORDER BY clauses used by their first-page queries.
CREATE INDEX IF NOT EXISTS events_occurred_id_idx
  ON events (occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS alerts_user_created_idx
  ON alerts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS alerts_user_unread_idx
  ON alerts (user_id, channel)
  WHERE read_at IS NULL;
