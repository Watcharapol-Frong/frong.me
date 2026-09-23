/** Fast, local editorial checks. These are writing aids, not ranking factors. */
export interface ArticleReviewCheck {
  label: string;
  status: 'ready' | 'suggestion' | 'optional';
  detail: string;
}

export function reviewArticleBasics(input: {
  title: string;
  excerpt: string;
  bodyMarkdown: string;
}): ArticleReviewCheck[] {
  const title = input.title.trim();
  const excerpt = input.excerpt.trim();
  const body = input.bodyMarkdown;
  const checks: ArticleReviewCheck[] = [
    {
      label: 'Article title',
      status: title ? 'ready' : 'suggestion',
      detail: title ? 'Present' : 'Add a title that tells readers what this article covers.',
    },
    {
      label: 'Short summary',
      status: excerpt ? 'ready' : 'suggestion',
      detail: excerpt ? 'Present' : 'Summarize this article for readers; the same text is used as its meta description.',
    },
  ];

  if (body.trim().length > 500) {
    const hasSections = /^#{2,6}\s+\S/m.test(body);
    checks.push({
      label: 'Section headings',
      status: hasSections ? 'ready' : 'suggestion',
      detail: hasSections ? 'Present' : 'Break a longer article into sections readers can scan.',
    });
  }

  if (/!\[\s*\]\([^)]+\)/.test(body)) {
    checks.push({
      label: 'Image descriptions',
      status: 'suggestion',
      detail: 'Describe the meaning of images that have empty alt text.',
    });
  }

  if (body.trim() && !/\[[^\]]+\]\((?:\/articles\/|https?:\/\/(?:www\.)?frong\.me\/articles\/)/i.test(body)) {
    checks.push({
      label: 'Related reading',
      status: 'optional',
      detail: 'Link to a relevant article on this site when one exists.',
    });
  }

  return checks;
}
