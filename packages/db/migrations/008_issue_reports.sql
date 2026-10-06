-- Milestone 8: data-correction / issue-reporting mechanism (spec §21,
-- "report an issue" action on event detail, §4.2).
--
-- Anonymous users may file a correction report against an event; reports are
-- stored in-app (zero third-party form services) and listed through the
-- admin-gated `GET /api/v1/admin/issues` endpoint. Contact is optional free
-- text (an email if the reporter wants a reply); no auth required so the
-- barrier to reporting is minimal. Retention: see /privacy.
CREATE TABLE IF NOT EXISTS issue_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN (
                'incorrect_fact',
                'wrong_entity_link',
                'missing_source',
                'stale_data',
                'other'
              )),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  contact     TEXT CHECK (char_length(contact) BETWEEN 1 AND 200),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
                'open', 'reviewed', 'resolved', 'dismissed'
              )),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_event_idx
  ON issue_reports (event_id);
CREATE INDEX IF NOT EXISTS issue_reports_status_idx
  ON issue_reports (status, created_at DESC);
