import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capabilityLabel,
  deriveShortLabel,
  deriveVendor,
  vendorLabel,
} from '../../src/types/ai.ts';

test('deriveVendor parses the vendor segment out of namespaced ids', () => {
  assert.equal(deriveVendor('openrouter', 'openai/gpt-4o-mini'), 'openai');
  assert.equal(deriveVendor('openrouter', '~deepseek/deepseek-pro-latest'), 'deepseek', 'strips the ~ free-tier marker before splitting');
  assert.equal(deriveVendor('cloudflare', '@cf/meta/llama-3.1-8b-instruct-fp8'), 'meta');
  assert.equal(deriveVendor('cloudflare', '@cf/microsoft/phi-2'), 'microsoft');
  assert.equal(deriveVendor('gemini', 'gemini-3.5-flash'), 'google', 'Gemini only ever has one vendor');
});

test('deriveVendor falls back to the provider name when an id has no namespace segment', () => {
  assert.equal(deriveVendor('openrouter', 'standalone-model'), 'standalone-model', 'the whole id becomes the vendor when there is no slash');
  assert.equal(deriveVendor('cloudflare', 'no-slash-id'), 'cloudflare');
});

test('vendorLabel title-cases known vendor slugs and unknown ones alike', () => {
  assert.equal(vendorLabel('openai'), 'OpenAI');
  assert.equal(vendorLabel('deepseek-ai'), 'DeepSeek');
  assert.equal(vendorLabel('inference-net'), 'Inference.net');
  assert.equal(vendorLabel('some-unlisted-vendor'), 'Some Unlisted Vendor', 'unrecognized slugs are still readable, not raw');
});

test('deriveShortLabel strips a redundant "Vendor: " prefix', () => {
  assert.equal(deriveShortLabel('openai', 'OpenAI: GPT-4o Mini'), 'GPT-4o Mini');
  assert.equal(deriveShortLabel('deepseek', 'DeepSeek: DeepSeek Pro Latest'), 'DeepSeek Pro Latest');
});

test('deriveShortLabel leaves a label alone when there is no vendor prefix to strip', () => {
  assert.equal(deriveShortLabel('google', 'Gemini 3.5 Flash'), 'Gemini 3.5 Flash');
});

test('deriveShortLabel truncates a long label with an ellipsis', () => {
  const long = 'A Really Very Extremely Long Model Display Name';
  const short = deriveShortLabel('openai', long);
  assert.ok(short.length <= 25, `expected truncation, got "${short}" (${short.length} chars)`);
  assert.ok(short.endsWith('…'));
});

test('capabilityLabel maps the two capability values to their display text', () => {
  assert.equal(capabilityLabel('text'), 'Text');
  assert.equal(capabilityLabel('text-image'), 'Text + Image');
});
