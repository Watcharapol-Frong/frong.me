export const SITE_NAME = 'frong.me';
export const SITE_OWNER = 'Watcharapol Charoensuk';
export const DEFAULT_DESCRIPTION = 'Portfolio of Watcharapol Charoensuk (Frong) — connecting data to business and strategy to impact through analytics, AI, and design thinking.';

const OWNER_LINKEDIN = 'https://www.linkedin.com/in/watcharapol-charoensuk-336b4a342';
const OWNER_GITHUB = 'https://github.com/Watcharapol-Frong';

interface BaseSeo {
  title?: string;
  description?: string;
  image?: string;
  language?: 'th' | 'en';
  noIndex?: boolean;
}

export interface WebsiteSeo extends BaseSeo {
  type?: 'website';
}

export interface ProfileSeo extends BaseSeo {
  type: 'profile';
}

export interface ArticleSeo extends BaseSeo {
  type: 'article';
  title: string;
  publishedAt: string;
  modifiedAt: string;
  tags?: string[];
}

export type PageSeo = WebsiteSeo | ProfileSeo | ArticleSeo;

export interface SeoMetadata {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  language: 'th' | 'en';
  locale: 'th_TH' | 'en_US';
  openGraphType: 'website' | 'profile' | 'article';
  noIndex: boolean;
  structuredData: Record<string, unknown>;
}

interface BuildSeoOptions {
  siteUrl: string;
  pathname: string;
  defaultImageUrl: string;
}

export function buildSeoMetadata(
  seo: PageSeo = {},
  options: BuildSeoOptions,
): SeoMetadata {
  const canonicalUrl = new URL(options.pathname, options.siteUrl).toString();
  const language = seo.language ?? 'en';
  const description = seo.description?.trim() || DEFAULT_DESCRIPTION;
  const imageUrl = seo.image || options.defaultImageUrl;
  const title = seo.title ? `${seo.title} | ${SITE_NAME}` : SITE_NAME;
  const openGraphType = seo.type ?? 'website';

  return {
    title,
    description,
    canonicalUrl,
    imageUrl,
    language,
    locale: language === 'th' ? 'th_TH' : 'en_US',
    openGraphType,
    noIndex: seo.noIndex === true,
    structuredData: buildStructuredData(seo, {
      canonicalUrl,
      description,
      imageUrl,
      language,
      siteUrl: options.siteUrl,
      title,
    }),
  };
}

function buildStructuredData(
  seo: PageSeo,
  values: {
    canonicalUrl: string;
    description: string;
    imageUrl: string;
    language: 'th' | 'en';
    siteUrl: string;
    title: string;
  },
): Record<string, unknown> {
  const siteUrl = new URL('/', values.siteUrl).toString();
  const personId = new URL('/about/#person', siteUrl).toString();
  const websiteId = new URL('/#website', siteUrl).toString();
  const person = {
    '@type': 'Person',
    '@id': personId,
    name: SITE_OWNER,
    alternateName: 'Frong',
    url: new URL('/about/', siteUrl).toString(),
    sameAs: [OWNER_LINKEDIN, OWNER_GITHUB],
  };
  const website = {
    '@type': 'WebSite',
    '@id': websiteId,
    url: siteUrl,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    inLanguage: ['en', 'th'],
    publisher: { '@id': personId },
  };

  if (seo.type === 'article') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        person,
        website,
        {
          '@type': 'BlogPosting',
          '@id': `${values.canonicalUrl}#article`,
          mainEntityOfPage: values.canonicalUrl,
          headline: seo.title,
          description: values.description,
          image: [values.imageUrl],
          datePublished: seo.publishedAt,
          dateModified: seo.modifiedAt,
          inLanguage: values.language,
          author: { '@id': personId },
          publisher: { '@id': personId },
          isPartOf: { '@id': websiteId },
          keywords: seo.tags?.join(', '),
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
            { '@type': 'ListItem', position: 2, name: seo.title, item: values.canonicalUrl },
          ],
        },
      ],
    };
  }

  if (seo.type === 'profile') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        person,
        website,
        {
          '@type': 'ProfilePage',
          '@id': `${values.canonicalUrl}#profile`,
          url: values.canonicalUrl,
          name: values.title,
          description: values.description,
          inLanguage: values.language,
          mainEntity: { '@id': personId },
          isPartOf: { '@id': websiteId },
        },
      ],
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [person, website],
  };
}
