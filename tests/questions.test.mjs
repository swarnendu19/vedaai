import assert from 'node:assert/strict';
import test from 'node:test';
import { extractQuestionsFromLines, normalizeQuestionNumber } from '../lib/veda/questions.ts';

function line(id, text, page = 1, top = 0.1) {
  const polygon = [{ x: 0.1, y: top }, { x: 0.9, y: top }, { x: 0.9, y: top + 0.03 }, { x: 0.1, y: top + 0.03 }];
  return { id, page, text, words: [], polygon, confidence: 0.98, provider: 'mistral' };
}

test('normalizes common question-number formats without losing hierarchy', () => {
  assert.equal(normalizeQuestionNumber('Q.11 (a)'), '11(a)');
  assert.equal(normalizeQuestionNumber('11 - A'), '11(a)');
  assert.equal(normalizeQuestionNumber('11(a)(i)'), '11(a)(i)');
  assert.equal(normalizeQuestionNumber('Ans 5(a)'), '5(a)');
});

test('splits answerable subparts and excludes the parent instruction', () => {
  const questions = extractQuestionsFromLines([
    line('1', '11. Answer the following:', 1, 0.1),
    line('2', '(a) Explain polymorphism. [3]', 1, 0.2),
    line('3', '(b) Explain abstraction. [3]', 1, 0.3),
  ]);
  assert.deepEqual(questions.map((question) => question.normalizedNumber), ['11(a)', '11(b)']);
  assert.deepEqual(questions.map((question) => question.marks), [3, 3]);
  assert.deepEqual(questions.map((question) => question.order), [1, 2]);
});

test('preserves original paper order across pages', () => {
  const questions = extractQuestionsFromLines([
    line('3', '3. Third question', 2, 0.1),
    line('1', '1. First question', 1, 0.1),
    line('2', '2. Second question', 1, 0.2),
  ]);
  assert.deepEqual(questions.map((question) => question.normalizedNumber), ['1', '2', '3']);
});

test('accepts Mistral markdown and Question No. prefixes', () => {
  const questions = extractQuestionsFromLines([
    line('1', '### **Question No. 1.** Which vessel carries blood away from the heart?', 1, 0.1),
    line('2', '- **Q. 2)** Name the organelle responsible for photosynthesis. [2]', 1, 0.2),
  ]);
  assert.deepEqual(questions.map((question) => question.normalizedNumber), ['1', '2']);
  assert.equal(questions[1].marks, 2);
});
