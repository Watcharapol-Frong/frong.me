-- Site-wide Earth admin settings (profile display name/handle, editor
-- defaults for new posts). Single-owner site, so a flat key-value table is
-- enough — no need for a per-user settings model.
CREATE TABLE site_settings (
  key         TEXT PRIMARY KEY CHECK (length(trim(key)) > 0),
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL CHECK (updated_at >= 0)
);
