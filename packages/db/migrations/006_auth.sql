-- Milestone 6: managed local authentication (spec §14).
--
-- users gains the credential columns needed by the local AuthProvider.
-- Emails are normalized to lowercase by the provider before insert, so a
-- plain UNIQUE index on TEXT is enough (no citext extension required).
-- Passwords are stored ONLY as scrypt hashes — never plaintext.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email         TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS display_name  TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Backfill/protect: once NOT NULL we enforce presence. Keep nullable in the
-- migration itself so pre-M6 rows (e.g. tests that inserted bare users) don't
-- break; the provider always writes all three columns.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq ON users (email);

-- Server-side sessions: the session *token* is never stored — only its
-- SHA-256 hash. A stolen database dump must not yield live sessions.
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);

-- Read/unread tracking for in-app alerts (notification center, spec §14).
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
