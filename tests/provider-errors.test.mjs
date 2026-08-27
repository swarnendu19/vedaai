import assert from 'node:assert/strict';
import test from 'node:test';
import { providerFailureMessage } from '../lib/veda/provider-errors.ts';

test('turns provider quota responses into actionable user messages', () => {
  assert.match(providerFailureMessage('Mistral OCR', 429), /usage limit or rate limit/i);
  assert.match(providerFailureMessage('Mistral OCR', 402), /no remaining credits/i);
});

test('does not expose opaque authentication errors to the UI', () => {
  assert.match(providerFailureMessage('Mistral OCR', 401), /credentials were rejected/i);
  assert.match(providerFailureMessage('Mistral OCR', 503), /temporarily unavailable/i);
});
