/**
 * Worker bindings come from the `cloudflare:workers` module. Astro v6 removed
 * `locals.runtime.env`, and the Cloudflare adapter now defines it as a getter
 * that throws, which turned every `/earth*` request into an HTTP 500.
 *
 * The import is dynamic so Node-based tests never have to resolve this
 * workerd-only module: they pass bindings through `locals.env`, which wins
 * whenever it is present.
 */
export interface InjectedEnvLocals<TEnv> {
  env?: TEnv;
}

export async function resolveRuntimeEnv<TEnv>(locals: unknown): Promise<TEnv> {
  const injected = (locals as InjectedEnvLocals<TEnv> | null | undefined)?.env;
  if (injected) return injected;
  const { env } = await import('cloudflare:workers');
  return env as TEnv;
}
