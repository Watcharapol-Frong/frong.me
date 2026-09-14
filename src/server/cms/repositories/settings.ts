import { type CmsDatabase } from '../db.ts';

export interface SiteSettings {
  ownerName: string;
  ownerHandle: string;
  defaultFont: string;
  defaultAiProvider: string;
}

export const SITE_SETTINGS_DEFAULTS: SiteSettings = {
  ownerName: 'Frong Watcharapol',
  ownerHandle: 'frong98',
  defaultFont: 'google-sans',
  defaultAiProvider: 'gemini',
};

const KEY_TO_FIELD: Record<string, keyof SiteSettings> = {
  owner_name: 'ownerName',
  owner_handle: 'ownerHandle',
  default_font: 'defaultFont',
  default_ai_provider: 'defaultAiProvider',
};

const FIELD_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_FIELD).map(([key, field]) => [field, key]),
) as Record<keyof SiteSettings, string>;

interface SiteSettingRow {
  key: string;
  value: string;
}

export async function getSiteSettings(db: CmsDatabase): Promise<SiteSettings> {
  const rows = await db.all<SiteSettingRow>('SELECT key, value FROM site_settings', []);
  const settings = { ...SITE_SETTINGS_DEFAULTS };
  for (const row of rows) {
    const field = KEY_TO_FIELD[row.key];
    if (field) settings[field] = row.value;
  }
  return settings;
}

/** Partial update: only the provided fields are written. */
export async function updateSiteSettings(
  db: CmsDatabase,
  patch: Partial<SiteSettings>,
  now = Date.now(),
): Promise<SiteSettings> {
  const entries = Object.entries(patch) as Array<[keyof SiteSettings, string | undefined]>;
  const statements = entries
    .filter((entry): entry is [keyof SiteSettings, string] => entry[1] !== undefined)
    .map(([field, value]) => ({
      sql: `INSERT INTO site_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      params: [FIELD_TO_KEY[field], value, now],
    }));
  if (statements.length > 0) await db.batch(statements);
  return getSiteSettings(db);
}
