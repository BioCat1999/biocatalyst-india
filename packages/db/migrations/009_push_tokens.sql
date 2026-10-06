-- Milestone 10: device push-token registry (spec §14).
--
-- Stores the native device push tokens that opted-in users register via
-- POST /api/v1/push-tokens, so a future fan-out step (still deferred —
-- it needs FCM/APNs credentials) can deliver alerts. Tokens are
-- per-user and bound to a session; a user can have several devices.
-- Retention: deleting a session/account removes tokens via the FK cascade.
CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token       TEXT NOT NULL CHECK (char_length(token) BETWEEN 1 AND 500),
  platform    TEXT NOT NULL DEFAULT 'expo' CHECK (platform IN ('expo', 'apns', 'fcm')),
  -- 'expo' = acquired via expo-notifications (native device token),
  -- 'apns'/'fcm' reserved for direct native integrations.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_idx
  ON push_tokens (user_id);
