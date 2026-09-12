/// <reference types="astro/client" />
/// <reference types="@sanity/astro/module" />

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
