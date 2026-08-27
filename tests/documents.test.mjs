import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesMimeSignature } from '../lib/veda/documents.ts';

test('accepts real PDF, PNG, and JPEG signatures', () => {
  assert.equal(matchesMimeSignature(new TextEncoder().encode('%PDF-1.7'), 'application/pdf'), true);
  assert.equal(matchesMimeSignature(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'), true);
  assert.equal(matchesMimeSignature(Uint8Array.from([255, 216, 255, 224]), 'image/jpeg'), true);
});

test('rejects a file whose declared MIME type does not match its bytes', () => {
  assert.equal(matchesMimeSignature(new TextEncoder().encode('not a pdf'), 'application/pdf'), false);
  assert.equal(matchesMimeSignature(Uint8Array.from([255, 216, 255]), 'image/png'), false);
});
