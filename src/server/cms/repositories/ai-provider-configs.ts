import { type CmsDatabase } from '../db.ts';
import { CmsBadRequestError } from '../errors.ts';
import {
  AI_PROVIDER_CONFIG_LIMITS,
  AI_PROVIDERS,
  deriveShortLabel,
  deriveVendor,
  type AiConfiguredModel,
  type AiModelCapability,
  type AiProvider,
  type AiProviderConfig,
  type UpdateAiProviderConfigInput,
} from '../../../types/ai.ts';

interface AiProviderConfigRow {
  provider: string;
  api_key: string | null;
  models: string;
}

/**
 * Fills in `vendor`/`short`/`capability` when a stored or incoming model
 * entry predates those fields (or a caller only sent `{id, label}`), so
 * older rows keep displaying correctly instead of breaking on read.
 */
function normalizeModel(provider: AiProvider, id: string, label: string, raw: Partial<AiConfiguredModel>): AiConfiguredModel {
  const vendor = typeof raw.vendor === 'string' && raw.vendor.trim() ? raw.vendor.trim() : deriveVendor(provider, id);
  const capability: AiModelCapability = raw.capability === 'text-image' ? 'text-image' : 'text';
  const short = typeof raw.short === 'string' && raw.short.trim() ? raw.short.trim() : deriveShortLabel(vendor, label);
  return { id, label, vendor, capability, short };
}

function parseModels(provider: AiProvider, json: string): AiConfiguredModel[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const result: AiConfiguredModel[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const raw = entry as Partial<AiConfiguredModel>;
      if (typeof raw.id !== 'string' || typeof raw.label !== 'string') continue;
      result.push(normalizeModel(provider, raw.id, raw.label, raw));
    }
    return result;
  } catch {
    return [];
  }
}

function toPublicConfig(row: AiProviderConfigRow): AiProviderConfig {
  const provider = row.provider as AiProvider;
  return {
    provider,
    hasApiKey: Boolean(row.api_key?.trim()),
    models: parseModels(provider, row.models),
  };
}

/** Client-facing list — never includes the actual key, only whether one is set. */
export async function getAiProviderConfigs(db: CmsDatabase): Promise<AiProviderConfig[]> {
  const rows = await db.all<AiProviderConfigRow>(
    'SELECT provider, api_key, models FROM ai_provider_configs',
    [],
  );
  return rows.map(toPublicConfig);
}

/**
 * Internal use only (the AI generate route resolving what to actually call
 * with) — this is the one place the real key value is read back out.
 */
export async function getAiProviderConfigForUse(
  db: CmsDatabase,
  provider: AiProvider,
): Promise<{ apiKey: string | null; models: AiConfiguredModel[] } | null> {
  const row = await db.first<AiProviderConfigRow>(
    'SELECT provider, api_key, models FROM ai_provider_configs WHERE provider = ?1',
    [provider],
  );
  if (!row) return null;
  return { apiKey: row.api_key, models: parseModels(provider, row.models) };
}

function validateModels(provider: AiProvider, models: unknown): AiConfiguredModel[] {
  if (!Array.isArray(models)) {
    throw new CmsBadRequestError('models must be an array');
  }
  if (models.length < AI_PROVIDER_CONFIG_LIMITS.MIN_MODELS || models.length > AI_PROVIDER_CONFIG_LIMITS.MAX_MODELS) {
    throw new CmsBadRequestError(
      `models must contain between ${AI_PROVIDER_CONFIG_LIMITS.MIN_MODELS} and ${AI_PROVIDER_CONFIG_LIMITS.MAX_MODELS} entries`,
    );
  }
  const seen = new Set<string>();
  const cleaned: AiConfiguredModel[] = [];
  for (const entry of models) {
    if (
      typeof entry !== 'object' || entry === null
      || typeof (entry as AiConfiguredModel).id !== 'string' || (entry as AiConfiguredModel).id.trim().length === 0
      || typeof (entry as AiConfiguredModel).label !== 'string' || (entry as AiConfiguredModel).label.trim().length === 0
    ) {
      throw new CmsBadRequestError('each model needs a non-empty id and label');
    }
    const raw = entry as Partial<AiConfiguredModel>;
    const id = (raw.id as string).trim();
    const label = (raw.label as string).trim();
    if (seen.has(id)) throw new CmsBadRequestError(`duplicate model id "${id}"`);
    seen.add(id);
    cleaned.push(normalizeModel(provider, id, label, raw));
  }
  return cleaned;
}

/**
 * Upserts one provider's config. `apiKey: undefined` in the input leaves
 * whatever key is already stored untouched (the settings form only sends a
 * new key when the author actually typed one — it never has the real
 * current value to send back unchanged).
 */
export async function updateAiProviderConfig(
  db: CmsDatabase,
  provider: AiProvider,
  input: UpdateAiProviderConfigInput,
  now = Date.now(),
): Promise<AiProviderConfig> {
  if (!(AI_PROVIDERS as readonly string[]).includes(provider)) {
    throw new CmsBadRequestError('Unknown provider');
  }
  const models = validateModels(provider, input.models);
  const modelsJson = JSON.stringify(models);

  if (input.apiKey === undefined) {
    // Leave api_key as-is: COALESCE against the existing row (or NULL for a first-time insert).
    await db.run(
      `INSERT INTO ai_provider_configs (provider, api_key, models, updated_at)
       VALUES (?1, NULL, ?2, ?3)
       ON CONFLICT(provider) DO UPDATE SET models = excluded.models, updated_at = excluded.updated_at`,
      [provider, modelsJson, now],
    );
  } else {
    const apiKey = input.apiKey === null ? null : input.apiKey.trim() || null;
    await db.run(
      `INSERT INTO ai_provider_configs (provider, api_key, models, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, models = excluded.models, updated_at = excluded.updated_at`,
      [provider, apiKey, modelsJson, now],
    );
  }

  const row = await db.first<AiProviderConfigRow>(
    'SELECT provider, api_key, models FROM ai_provider_configs WHERE provider = ?1',
    [provider],
  );
  if (!row) throw new CmsBadRequestError('Failed to save provider config');
  return toPublicConfig(row);
}
