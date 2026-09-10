CREATE TABLE IF NOT EXISTS cms_releases (
  release_id TEXT PRIMARY KEY,
  manifest_json TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'live', 'failed')),
  created_at TEXT NOT NULL
);

INSERT OR REPLACE INTO cms_releases (
  release_id,
  manifest_json,
  manifest_sha256,
  status,
  created_at
) VALUES (
  'rel_20260910_spike001',
  '{"release_id":"rel_20260910_spike001","generated_at":"2026-09-10T00:00:00.000Z","articles":[{"slug":"architecture-proof","lang":"en","title":"Architecture proof","html":"<p>Public release fixture.</p>"}]}',
  '01419e593ab155f2488b6e5391a6ea09f9edfea64efa76a6f68602508371d708',
  'ready',
  '2026-09-10T00:00:00.000Z'
);
