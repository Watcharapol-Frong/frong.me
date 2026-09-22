export const ANALYTICS_CONSENT_STORAGE_KEY = 'frong:analytics-consent:v1';
export const ANALYTICS_CONSENT_VERSION = 1;
export const ANALYTICS_CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type AnalyticsConsentChoice = 'granted' | 'denied';

interface AnalyticsConsentRecord {
  choice: AnalyticsConsentChoice;
  version: number;
  updatedAt: string;
}

export function serializeAnalyticsConsent(
  choice: AnalyticsConsentChoice,
  now = Date.now(),
): string {
  return JSON.stringify({
    choice,
    version: ANALYTICS_CONSENT_VERSION,
    updatedAt: new Date(now).toISOString(),
  } satisfies AnalyticsConsentRecord);
}

export function resolveAnalyticsConsent(
  raw: string | null,
  now = Date.now(),
): AnalyticsConsentChoice | null {
  if (!raw) return null;

  try {
    const record = JSON.parse(raw) as Partial<AnalyticsConsentRecord>;
    if (
      record.version !== ANALYTICS_CONSENT_VERSION
      || (record.choice !== 'granted' && record.choice !== 'denied')
      || typeof record.updatedAt !== 'string'
    ) {
      return null;
    }

    const updatedAt = Date.parse(record.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt > now) return null;
    if (now - updatedAt >= ANALYTICS_CONSENT_MAX_AGE_MS) return null;

    return record.choice;
  } catch {
    return null;
  }
}

function readStoredChoice(): AnalyticsConsentChoice | null {
  try {
    return resolveAnalyticsConsent(
      window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function saveChoice(choice: AnalyticsConsentChoice): void {
  try {
    window.localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      serializeAnalyticsConsent(choice),
    );
  } catch {
    // Privacy settings can disable storage. Consent still applies to this page.
  }
}

function expireGoogleAnalyticsCookies(hostname: string): void {
  let cookieNames: string[];
  try {
    cookieNames = document.cookie
      .split(';')
      .map((cookie) => cookie.split('=')[0]?.trim())
      .filter((name): name is string => name === '_ga' || Boolean(name?.startsWith('_ga_')));
  } catch {
    return;
  }

  const hostParts = hostname.split('.').filter(Boolean);
  const domains = hostParts.flatMap((_, index) => {
    const domain = hostParts.slice(index).join('.');
    return domain.includes('.') ? [domain, `.${domain}`] : [];
  });

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}; SameSite=Lax`;
    }
  }
}

/**
 * Mounts the complete analytics-consent behavior on one server-rendered root.
 * The root's data attributes are the module interface used by Analytics.astro.
 */
export function mountAnalyticsConsent(root: HTMLElement): () => void {
  if (root.dataset.analyticsMounted === 'true') return () => {};
  root.dataset.analyticsMounted = 'true';

  const measurementId = root.dataset.measurementId;
  const panel = root.querySelector<HTMLElement>('[data-analytics-consent]');
  const settings = root.querySelector<HTMLButtonElement>('[data-analytics-settings]');
  const accept = root.querySelector<HTMLButtonElement>('[data-analytics-accept]');
  const deny = root.querySelector<HTMLButtonElement>('[data-analytics-deny]');
  const status = root.querySelector<HTMLElement>('[data-analytics-status]');

  if (!measurementId || !panel || !settings || !accept || !deny || !status) {
    return () => {};
  }

  let loaded = false;
  let choice = readStoredChoice();

  const updateStatus = () => {
    if (!choice) {
      status.hidden = true;
      return;
    }
    status.hidden = false;
    status.textContent = choice === 'granted'
      ? root.dataset.statusGranted ?? 'Analytics is allowed.'
      : root.dataset.statusDenied ?? 'Analytics is declined.';
  };
  const showPanel = (moveFocus = false) => {
    updateStatus();
    panel.hidden = false;
    settings.hidden = true;
    if (moveFocus) deny.focus();
  };
  const hidePanel = (moveFocus = false) => {
    panel.hidden = true;
    settings.hidden = false;
    if (moveFocus) settings.focus();
  };
  const gtag = (...args: unknown[]) => {
    const analyticsWindow = window as Window & { dataLayer?: unknown[][] };
    analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
    analyticsWindow.dataLayer.push(args);
  };
  const loadAnalytics = () => {
    if (loaded) return;
    loaded = true;
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  };
  const revokeAnalytics = () => {
    if (loaded) gtag('consent', 'update', { analytics_storage: 'denied' });
    expireGoogleAnalyticsCookies(window.location.hostname);
  };
  const choose = (nextChoice: AnalyticsConsentChoice) => {
    choice = nextChoice;
    saveChoice(nextChoice);
    if (nextChoice === 'granted') loadAnalytics();
    else revokeAnalytics();
    hidePanel(true);
  };

  const onAccept = () => choose('granted');
  const onDeny = () => choose('denied');
  const onSettings = () => showPanel(true);
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && choice) hidePanel(true);
  };

  accept.addEventListener('click', onAccept);
  deny.addEventListener('click', onDeny);
  settings.addEventListener('click', onSettings);
  panel.addEventListener('keydown', onKeydown);

  if (choice === 'granted') {
    hidePanel();
    loadAnalytics();
  } else if (choice === 'denied') {
    hidePanel();
  } else {
    showPanel();
  }

  return () => {
    accept.removeEventListener('click', onAccept);
    deny.removeEventListener('click', onDeny);
    settings.removeEventListener('click', onSettings);
    panel.removeEventListener('keydown', onKeydown);
    delete root.dataset.analyticsMounted;
  };
}
