import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ANALYTICS_CONSENT_MAX_AGE_MS,
  resolveAnalyticsConsent,
  serializeAnalyticsConsent,
} from '../../src/lib/analytics-consent.ts';

const NOW = Date.parse('2026-09-22T12:00:00.000Z');

test('analytics consent round-trips both choices through the module interface', () => {
  assert.equal(resolveAnalyticsConsent(serializeAnalyticsConsent('granted', NOW), NOW), 'granted');
  assert.equal(resolveAnalyticsConsent(serializeAnalyticsConsent('denied', NOW), NOW), 'denied');
});

test('analytics consent rejects expired, future, legacy, and malformed records', () => {
  const expired = serializeAnalyticsConsent('granted', NOW - ANALYTICS_CONSENT_MAX_AGE_MS);
  const future = serializeAnalyticsConsent('granted', NOW + 1);
  const wrongVersion = JSON.stringify({
    choice: 'granted',
    version: 999,
    updatedAt: new Date(NOW).toISOString(),
  });

  assert.equal(resolveAnalyticsConsent(expired, NOW), null);
  assert.equal(resolveAnalyticsConsent(future, NOW), null);
  assert.equal(resolveAnalyticsConsent(wrongVersion, NOW), null);
  assert.equal(resolveAnalyticsConsent('granted', NOW), null);
  assert.equal(resolveAnalyticsConsent('{broken', NOW), null);
  assert.equal(resolveAnalyticsConsent(null, NOW), null);
});

test('analytics UI keeps consent optional, bilingual, reversible, and linked to privacy details', () => {
  const analytics = readFileSync('src/components/Analytics.astro', 'utf8');
  const layout = readFileSync('src/layouts/Layout.astro', 'utf8');
  const privacy = readFileSync('src/pages/privacy.astro', 'utf8');

  assert.match(analytics, /const enabled = Boolean\(measurementId/);
  assert.match(analytics, /data-analytics-deny/);
  assert.match(analytics, /data-analytics-accept/);
  assert.match(analytics, /ตั้งค่าข้อมูลวิเคราะห์/);
  assert.match(analytics, /href="\/privacy\/"/);
  assert.match(layout, /language=\{metadata\.language\}/);
  assert.match(privacy, /Google Analytics 4/);
  assert.match(privacy, /lang="th"/);
  assert.match(privacy, /lang="en"/);
});
