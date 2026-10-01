/** Search discovery is limited to the canonical public site. */
export const PUBLIC_SITE_URL = 'https://frong.me';

export function isPublicSearchHost(url: URL): boolean {
  return url.hostname === new URL(PUBLIC_SITE_URL).hostname;
}

export function buildRobotsTxt(url: URL): string {
  if (!isPublicSearchHost(url)) return 'User-agent: *\nDisallow: /\n';

  // One shared group: named search crawlers retain the same private-path rules.
  // Training preferences are unchanged; robots.txt is not authentication.
  return [
    'User-agent: *',
    'User-agent: Googlebot',
    'User-agent: Bingbot',
    'User-agent: OAI-SearchBot',
    'User-agent: Claude-SearchBot',
    'Allow: /',
    'Disallow: /earth$',
    'Disallow: /earth/',
    '',
    `Sitemap: ${PUBLIC_SITE_URL}/sitemap-index.xml`,
    `Sitemap: ${PUBLIC_SITE_URL}/articles-sitemap.xml`,
    '',
  ].join('\n');
}
