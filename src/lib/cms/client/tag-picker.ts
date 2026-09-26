export const MAX_ARTICLE_TAGS = 2;

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Reuses canonical catalog spelling and removes case-only duplicates. */
export function normalizeSelectedTags(
  values: readonly string[],
  catalog: readonly string[],
  limit = MAX_ARTICLE_TAGS,
): string[] {
  const canonical = new Map(catalog.map((tag) => [key(tag), tag.trim()]));
  const selected = new Map<string, string>();
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const normalized = key(trimmed);
    if (!selected.has(normalized)) selected.set(normalized, canonical.get(normalized) ?? trimmed);
    if (selected.size === limit) break;
  }
  return [...selected.values()];
}

export function matchingTagSuggestions(
  catalog: readonly string[],
  selected: readonly string[],
  query: string,
): string[] {
  const selectedKeys = new Set(selected.map(key));
  const needle = key(query);
  return catalog.filter((tag) => !selectedKeys.has(key(tag)) && key(tag).includes(needle));
}

export function canCreateTag(
  catalog: readonly string[],
  selected: readonly string[],
  query: string,
): boolean {
  const candidate = key(query);
  if (!candidate || selected.length >= MAX_ARTICLE_TAGS) return false;
  return ![...catalog, ...selected].some((tag) => key(tag) === candidate);
}
