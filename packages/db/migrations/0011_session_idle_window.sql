-- Each session keeps its own idle window: 12 hours by default, the "remember me" length when
-- the person ticked it. Sliding the idle expiry forward on use needs to know which one applies,
-- and inferring it from the other timestamps would be guesswork.

ALTER TABLE sessions
  ADD COLUMN idle_seconds integer NOT NULL DEFAULT 43200,
  ADD CONSTRAINT sessions_idle_seconds_positive CHECK (idle_seconds > 0);

-- The cleanup job deletes sessions by their absolute expiry.
CREATE INDEX sessions_absolute_expires_at_idx ON sessions (absolute_expires_at);
