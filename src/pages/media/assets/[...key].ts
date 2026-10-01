import type { APIRoute } from 'astro';
import type { AssetRow } from '../../../lib/cms/contracts.ts';
import { resolveCmsEnvironment } from '../../../server/cms/api.ts';
import { createCmsDatabase } from '../../../server/cms/db.ts';
import { CmsDatabaseError, cmsErrorResponse } from '../../../server/cms/errors.ts';

export const prerender = false;

/** Serve only registered public assets from this Worker's own environment. */
export const GET: APIRoute = async ({ params, locals, request }) => {
  const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  const key = params.key ?? '';
  if (!/^[a-f0-9]{64}\/[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(key)) return notFound();
  try {
    const env = await resolveCmsEnvironment(locals);
    if (!env.DB || !env.MEDIA_BUCKET) throw new CmsDatabaseError('Media bindings are unavailable');
    const objectKey = `assets/${key}`;
    const asset = await createCmsDatabase(env.DB).first<AssetRow>(
      `SELECT * FROM assets WHERE public_r2_key = ?1 AND lifecycle = 'public' LIMIT 1`,
      [objectKey],
    );
    if (!asset) return notFound();
    const object = await env.MEDIA_BUCKET.get(objectKey);
    if (!object) return notFound();
    return new Response(request.method === 'HEAD' ? null : object.body, {
      headers: {
        'content-type': asset.mime_type,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) { return cmsErrorResponse(error); }
};

export const HEAD = GET;
