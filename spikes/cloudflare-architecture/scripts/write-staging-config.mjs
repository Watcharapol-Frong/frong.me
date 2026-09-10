import { mkdir, writeFile } from 'node:fs/promises';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const teamDomain = new URL(required('CF_ACCESS_TEAM_DOMAIN'));
if (
  teamDomain.protocol !== 'https:' ||
  !teamDomain.hostname.endsWith('.cloudflareaccess.com') ||
  teamDomain.pathname !== '/'
) {
  throw new Error('CF_ACCESS_TEAM_DOMAIN must be an HTTPS cloudflareaccess.com origin');
}

const siteOrigin = new URL(required('CMS_SITE_ORIGIN'));
if (siteOrigin.protocol !== 'https:' || siteOrigin.pathname !== '/') {
  throw new Error('CMS_SITE_ORIGIN must be an HTTPS origin');
}

const databaseId = required('CF_D1_DATABASE_ID');
if (!/^[a-f0-9-]{36}$/i.test(databaseId)) throw new Error('CF_D1_DATABASE_ID must be a UUID');

const outputDirectory = new URL('../.generated/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const config = {
  $schema: '../node_modules/wrangler/config-schema.json',
  name: 'frong-cms-architecture-spike-staging',
  main: '@astrojs/cloudflare/entrypoints/server',
  compatibility_date: '2026-09-10',
  compatibility_flags: ['nodejs_compat'],
  assets: { binding: 'ASSETS', directory: '../dist' },
  vars: {
    CMS_SITE_ORIGIN: siteOrigin.origin,
    CF_ACCESS_TEAM_DOMAIN: teamDomain.origin,
  },
  d1_databases: [
    {
      binding: 'DB',
      database_name: required('CF_D1_DATABASE_NAME'),
      database_id: databaseId,
    },
  ],
};

await writeFile(
  new URL('wrangler.staging.jsonc', outputDirectory),
  `${JSON.stringify(config, null, 2)}\n`,
  { mode: 0o600 },
);
await writeFile(
  new URL('staging.secrets', outputDirectory),
  `CF_ACCESS_AUD=${JSON.stringify(required('CF_ACCESS_AUD'))}\nCF_ACCESS_ALLOWED_EMAIL=${JSON.stringify(required('CF_ACCESS_ALLOWED_EMAIL'))}\n`,
  { mode: 0o600 },
);
console.log('Generated ephemeral staging configuration');
