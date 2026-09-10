/**
 * Build-only fallback while the retired Sanity demo has no local credentials.
 * Configured deployments use the real `sanity:client` virtual module instead.
 */
export const sanityClient = {
  async fetch<T>(): Promise<T> {
    return [] as T;
  },
};
