/** The public article route uses the same ASCII slug and length as post validation. */
export function postSlugFeedback(value: string): string | null {
  if (!value) return 'Add an English URL name, e.g. my-first-article.';
  if (value.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return 'Article URL needs lowercase English letters, numbers, and hyphens, e.g. my-first-article.';
  }
  return null;
}
