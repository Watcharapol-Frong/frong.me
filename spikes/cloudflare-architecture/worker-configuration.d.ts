interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CMS_SITE_ORIGIN: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  CF_ACCESS_ALLOWED_EMAIL: string;
}

declare module 'cloudflare:workers' {
  export const env: Env;
}
