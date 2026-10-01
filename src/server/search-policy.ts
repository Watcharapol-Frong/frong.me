import { isPublicSearchHost } from '../lib/search-policy.ts';
import { isEarthRoute } from './cms/access-guard.ts';

/** Apply after Access verification, including denied/API/redirect responses. */
export function applySearchHeaders(url: URL, response: Response): Response {
  if (isPublicSearchHost(url) && !isEarthRoute(url.pathname)) return response;

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  // Redirect/fetch responses may have immutable headers; preserve their bodies.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
