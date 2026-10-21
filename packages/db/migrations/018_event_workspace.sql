-- Personal research workflow: saved events, notes and reading history.
CREATE TABLE IF NOT EXISTS user_event_state (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ,
  note        TEXT,
  first_read_at TIMESTAMPTZ,
  last_read_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id),
  CHECK (note IS NULL OR char_length(note) <= 5000)
);

CREATE INDEX IF NOT EXISTS user_event_saved_idx
  ON user_event_state (user_id, saved_at DESC) WHERE saved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_event_history_idx
  ON user_event_state (user_id, last_read_at DESC) WHERE last_read_at IS NOT NULL;
