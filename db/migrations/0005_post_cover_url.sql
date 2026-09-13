-- Editor-set cover image URL, stored directly on the post so a pasted
-- external URL (e.g. Unsplash) persists without going through the
-- assets/post_asset_usages R2 pipeline, which only models uploaded media.
-- An uploaded cover still also attaches via post_asset_usages (0002); this
-- column mirrors its URL too, so it can serve as the reader's fallback when
-- no asset-based cover usage row exists.
ALTER TABLE posts ADD COLUMN cover_image_url TEXT
  CHECK (cover_image_url IS NULL OR cover_image_url LIKE 'https://%');
