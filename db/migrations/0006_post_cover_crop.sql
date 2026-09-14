-- Cover image focal point + zoom, set by dragging/zooming the cover preview
-- in the Earth editor. Applies to `cover_image_url` regardless of whether it
-- came from a pasted external URL or the editor's own upload flow (both set
-- the same column, per 0005) — this is a single unified field, unrelated to
-- post_asset_usages.crop_json (0001), which is a separate, currently-unused
-- per-asset mechanism.
--
-- Mirrors post_asset_usages.crop_json's {x,y,zoom} shape for consistency:
-- x/y are focal-point percentages (0-100), zoom is a multiplier (>= 1).
ALTER TABLE posts ADD COLUMN cover_crop TEXT
  CHECK (cover_crop IS NULL OR json_valid(cover_crop));
