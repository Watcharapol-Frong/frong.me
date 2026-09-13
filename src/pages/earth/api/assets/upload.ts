import type { APIRoute } from 'astro';

import { extractImageMetadata } from '../../../../lib/cms/assets/metadata.ts';
import { uploadAsset } from '../../../../lib/cms/assets/r2.ts';
import { CmsValidationError } from '../../../../lib/cms/validation.ts';
import { resolveCmsEnvironment, privateJson } from '../../../../server/cms/api.ts';
import { createCmsDatabase } from '../../../../server/cms/db.ts';
import { CmsBadRequestError, CmsDatabaseError, cmsErrorResponse } from '../../../../server/cms/errors.ts';
import { createAsset, promoteAsset } from '../../../../server/cms/repositories/assets.ts';

export const prerender = false;

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Direct-to-R2 media upload. There is no separate approval/promotion step:
 * under the direct-SSR model an uploaded image is immediately public, so the
 * editor's drag-and-drop can insert its URL right away.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = await resolveCmsEnvironment(locals);
    if (!env.DB) throw new CmsDatabaseError('CMS database binding is unavailable');
    if (!env.MEDIA_BUCKET) throw new CmsDatabaseError('Media bucket binding is unavailable');
    const db = createCmsDatabase(env.DB);

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'multipart/form-data') {
      throw new CmsBadRequestError('Content-Type must be multipart/form-data');
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new CmsValidationError('file', 'must be an uploaded file field named "file"');
    }
    if (file.size === 0) throw new CmsValidationError('file', 'must not be empty');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new CmsValidationError('file', `must be at most ${MAX_UPLOAD_BYTES} bytes`);
    }
    const mediaKindRaw = form.get('mediaKind');
    const mediaKind = mediaKindRaw === 'chart' || mediaKindRaw === 'illustration' ? mediaKindRaw : 'photo';

    const bytes = new Uint8Array(await file.arrayBuffer());
    const metadata = await extractImageMetadata(bytes);
    const uploaded = await uploadAsset(env.MEDIA_BUCKET as never, bytes, file.name || 'upload', {
      contentType: metadata.mimeType,
    });

    const assetId = `asset_${crypto.randomUUID().replace(/-/g, '')}`;
    await createAsset(db, {
      id: assetId,
      mediaKind,
      privateR2Key: uploaded.key,
      originalName: file.name || undefined,
      mimeType: metadata.mimeType,
      width: metadata.width,
      height: metadata.height,
      byteSize: metadata.byteSize,
      sha256: metadata.sha256,
    });
    const asset = await promoteAsset(db, assetId, uploaded.key);

    return privateJson({
      id: asset.id,
      mediaKind: asset.media_kind,
      url: uploaded.url,
      mimeType: asset.mime_type,
      width: asset.width,
      height: asset.height,
      byteSize: asset.byte_size,
      sha256: asset.sha256,
    }, 201);
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
