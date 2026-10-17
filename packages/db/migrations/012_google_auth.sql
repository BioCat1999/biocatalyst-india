-- Google account linkage for passwordless sign-up/sign-in.
-- `sub` is Google's stable account identifier; email is profile data and can
-- change, so it is never used as the external identity key.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uniq
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;
