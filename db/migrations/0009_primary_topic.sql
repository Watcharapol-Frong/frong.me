-- Fixed first-level article taxonomy. Nullable keeps existing posts valid;
-- tags remain in their existing many-to-many taxonomy tables.
ALTER TABLE posts ADD COLUMN primary_topic TEXT
  CHECK (primary_topic IS NULL OR primary_topic IN ('data', 'technology', 'business'));
