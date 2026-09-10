export const prerender = true;

export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" role="img" aria-label="frong.me CMS architecture proof"><rect width="1200" height="630" fill="#111827"/><text x="80" y="300" fill="#f9fafb" font-family="system-ui" font-size="72">frong.me CMS</text><text x="80" y="390" fill="#93c5fd" font-family="system-ui" font-size="44">Architecture proof</text></svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
