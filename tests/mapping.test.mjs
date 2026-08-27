import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuestionResults, mapAnswers, segmentAnswers } from '../lib/veda/mapping.ts';

function polygon(top) { return [{ x: 0.1, y: top }, { x: 0.9, y: top }, { x: 0.9, y: top + 0.04 }, { x: 0.1, y: top + 0.04 }]; }
function line(id, text, page, top, confidence = 0.96) { return { id, text, page, polygon: polygon(top), confidence, provider: 'mistral', words: [] }; }
function page(number, lines) { return { page: number, width: 1000, height: 1400, provider: 'mistral', lines }; }
function question(id, order, text = `Question ${id}`) { return { id, number: id, normalizedNumber: id, order, text, page: 1, sourcePolygons: [], confidence: 0.98 }; }

test('maps explicitly numbered answers even when the student writes them out of order', () => {
  const questions = [question('1', 1), question('2', 2), question('3(a)', 3)];
  const answers = segmentAnswers([page(1, [line('a', '3(a) Third response', 1, 0.1), line('b', '1 First response', 1, 0.3)])]);
  const mapped = mapAnswers(questions, answers);
  assert.deepEqual(mapped.map((answer) => answer.mappedQuestionId), ['3(a)', '1']);
  assert.ok(mapped.every((answer) => answer.status === 'matched'));
});

test('keeps skipped questions unanswered and unknown writing unmatched', () => {
  const questions = [question('1', 1), question('2', 2)];
  const answers = segmentAnswers([page(1, [line('u', 'Unlabelled unrelated notes', 1, 0.1, 0.4), line('a', '1 Valid response', 1, 0.3)])]);
  const mapped = mapAnswers(questions, answers);
  const results = buildQuestionResults(questions, mapped);
  assert.equal(mapped[0].status, 'unmatched');
  assert.equal(results.find((item) => item.id === '2')?.status, 'unanswered');
});

test('preserves separate geometry regions when one answer continues onto another page', () => {
  const answers = segmentAnswers([
    page(1, [line('a', '11(a)(i) First page of the answer', 1, 0.2)]),
    page(2, [line('b', 'continued explanation', 2, 0.1)]),
  ]);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].normalizedDetectedNumber, '11(a)(i)');
  assert.deepEqual(answers[0].regions.map((region) => region.page), [1, 2]);
  assert.ok(answers[0].regions.every((region) => region.polygons.length === 1));
});

test('segments two numbered answers on the same page without merging their polygons', () => {
  const answers = segmentAnswers([page(1, [line('a', '1 First answer', 1, 0.1), line('b', 'detail', 1, 0.2), line('c', '2 Second answer', 1, 0.5)])]);
  assert.equal(answers.length, 2);
  assert.equal(answers[0].regions[0].polygons.length, 2);
  assert.equal(answers[1].regions[0].polygons.length, 1);
});
