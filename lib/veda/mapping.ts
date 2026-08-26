import { CONFIDENCE_THRESHOLDS, MAPPING_WEIGHTS } from './config';
import { polygonBounds } from './documents';
import { normalizeQuestionNumber } from './questions';
import type { AnswerCandidate, AnswerRegion, MappingScore, OCRLine, OCRPage, Question, QuestionResult } from './types';

const ANCHOR = /^\s*(?:(?:q(?:uestion)?|ans(?:wer)?)\.?\s*)?(\d{1,3})(?:\s*(?:\(\s*([a-z])\s*\)|-\s*([a-z])\b|([a-z])(?=\s*(?:[.):-]|\(|$))))?(?:\s*\(\s*((?:i{1,3}|iv|v|vi{0,3}|ix|x))\s*\))?\s*[.):-]?\s*(.*)$/i;
type ParsedAnchor = { number: string; letter?: string; roman?: string; body: string };

function parseAnchor(text: string): ParsedAnchor | undefined {
  const match = text.match(ANCHOR);
  if (!match) return undefined;
  return {
    number: match[1],
    letter: match[2] ?? match[3] ?? match[4],
    roman: match[5],
    body: match[6] ?? '',
  };
}

function top(line: OCRLine) {
  return line.polygon.length ? polygonBounds(line.polygon).top : 0;
}

function regionFromLines(lines: OCRLine[]): AnswerRegion[] {
  const byPage = new Map<number, OCRLine[]>();
  for (const line of lines) byPage.set(line.page, [...(byPage.get(line.page) ?? []), line]);
  return [...byPage.entries()].map(([page, pageLines]) => ({
    page,
    polygons: pageLines.map((line) => line.polygon).filter((polygon) => polygon.length),
    startLineId: pageLines[0]?.id,
    endLineId: pageLines.at(-1)?.id,
  }));
}

export function segmentAnswers(pages: OCRPage[]): AnswerCandidate[] {
  const lines = pages.flatMap((page) => page.lines).sort((a, b) => a.page - b.page || top(a) - top(b));
  const candidates: AnswerCandidate[] = [];
  let active: { anchor?: ParsedAnchor; lines: OCRLine[] } | undefined;
  for (const line of lines) {
    const anchor = parseAnchor(line.text);
    if (anchor) {
      if (active?.lines.length) candidates.push(toCandidate(active, candidates.length));
      active = { anchor, lines: [line] };
    } else if (active) {
      active.lines.push(line);
    } else {
      active = { lines: [line] };
    }
  }
  if (active?.lines.length) candidates.push(toCandidate(active, candidates.length));
  return candidates;
}

function toCandidate(source: { anchor?: ParsedAnchor; lines: OCRLine[] }, index: number): AnswerCandidate {
  const anchor = source.anchor;
  const detected = anchor ? `${anchor.number}${anchor.letter ? `(${anchor.letter})` : ''}${anchor.roman ? `(${anchor.roman})` : ''}` : undefined;
  const firstBody = anchor?.body.trim();
  const text = [firstBody, ...source.lines.slice(anchor ? 1 : 0).map((line) => line.text)].filter(Boolean).join('\n');
  return {
    id: `answer-${index + 1}`,
    detectedQuestionNumber: detected,
    normalizedDetectedNumber: detected ? normalizeQuestionNumber(detected) : undefined,
    text,
    lines: source.lines,
    regions: regionFromLines(source.lines),
    mappingConfidence: 0,
    status: 'unmatched',
  };
}

const STOP_WORDS = new Set('a an and are as at be by for from how in into is it of on or that the their this to was what which with'.split(' '));

function tokenVector(text: string) {
  const counts = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

export function semanticSimilarity(left: string, right: string) {
  const a = tokenVector(left);
  const b = tokenVector(right);
  const terms = new Set([...a.keys(), ...b.keys()]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const term of terms) {
    const x = a.get(term) ?? 0;
    const y = b.get(term) ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

function sequenceScore(answerIndex: number, questionIndex: number, answerCount: number, questionCount: number) {
  if (answerCount <= 1 || questionCount <= 1) return 0.5;
  return Math.max(0, 1 - Math.abs(answerIndex / (answerCount - 1) - questionIndex / (questionCount - 1)));
}

function scorePair(answer: AnswerCandidate, question: Question, answerIndex: number, questionIndex: number, answerCount: number, questionCount: number): MappingScore {
  const exact = answer.normalizedDetectedNumber === question.normalizedNumber ? 1 : 0;
  const sameParent = answer.normalizedDetectedNumber?.replace(/\(.+$/, '') === question.normalizedNumber.replace(/\(.+$/, '');
  const number = exact ? 1 : sameParent ? 0.35 : 0;
  const semantic = semanticSimilarity(question.text, answer.text);
  const llm = semantic;
  const sequence = sequenceScore(answerIndex, questionIndex, answerCount, questionCount);
  const ocr = answer.lines.length ? answer.lines.reduce((sum, line) => sum + line.confidence, 0) / answer.lines.length : 0;
  const total =
    number * MAPPING_WEIGHTS.number +
    semantic * MAPPING_WEIGHTS.semantic +
    llm * MAPPING_WEIGHTS.llm +
    sequence * MAPPING_WEIGHTS.sequence +
    ocr * MAPPING_WEIGHTS.ocr;
  return { questionId: question.id, number, semantic, llm, sequence, ocr, total };
}

function maximizeAssignment(matrix: number[][]) {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const size = Math.max(rows, cols);
  if (!size) return [] as number[];
  const maxValue = Math.max(0, ...matrix.flat());
  const cost = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => maxValue - (matrix[row]?.[col] ?? 0)),
  );
  const u = Array(size + 1).fill(0);
  const v = Array(size + 1).fill(0);
  const p = Array(size + 1).fill(0);
  const way = Array(size + 1).fill(0);
  for (let row = 1; row <= size; row += 1) {
    p[0] = row;
    let col0 = 0;
    const minv = Array(size + 1).fill(Infinity);
    const used = Array(size + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = p[col0];
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= size; col += 1) {
        if (used[col]) continue;
        const current = cost[row0 - 1][col - 1] - u[row0] - v[col];
        if (current < minv[col]) { minv[col] = current; way[col] = col0; }
        if (minv[col] < delta) { delta = minv[col]; col1 = col; }
      }
      for (let col = 0; col <= size; col += 1) {
        if (used[col]) { u[p[col]] += delta; v[col] -= delta; }
        else minv[col] -= delta;
      }
      col0 = col1;
    } while (p[col0] !== 0);
    do {
      const col1 = way[col0];
      p[col0] = p[col1];
      col0 = col1;
    } while (col0 !== 0);
  }
  const assignment = Array(rows).fill(-1);
  for (let col = 1; col <= size; col += 1) {
    if (p[col] <= rows && col <= cols) assignment[p[col] - 1] = col - 1;
  }
  return assignment;
}

export function mapAnswers(questions: Question[], answers: AnswerCandidate[]) {
  const scores = answers.map((answer, answerIndex) => questions.map((question, questionIndex) =>
    scorePair(answer, question, answerIndex, questionIndex, answers.length, questions.length),
  ));
  const assignment = maximizeAssignment(scores.map((row) => row.map((score) => score.total)));
  const mapped = answers.map((answer, answerIndex) => {
    const candidateScores = scores[answerIndex].slice().sort((a, b) => b.total - a.total);
    const questionIndex = assignment[answerIndex];
    const selected = questionIndex >= 0 ? scores[answerIndex][questionIndex] : undefined;
    if (!selected) return { ...answer, candidateScores };
    const exactNumber = selected.number === 1;
    const confidence = exactNumber
      ? Math.min(0.99, 0.92 + selected.semantic * 0.05 + selected.ocr * 0.02)
      : selected.total;
    const status = confidence >= CONFIDENCE_THRESHOLDS.accept
      ? 'matched'
      : confidence >= CONFIDENCE_THRESHOLDS.verify
        ? 'uncertain'
        : 'unmatched';
    return {
      ...answer,
      mappedQuestionId: status === 'unmatched' ? undefined : questions[questionIndex].id,
      mappingConfidence: confidence,
      mappingMethod: exactNumber ? 'explicit_number+global_assignment' : 'semantic+sequence+global_assignment',
      status,
      candidateScores,
    } as AnswerCandidate;
  });
  return mapped;
}

export function buildQuestionResults(questions: Question[], answers: AnswerCandidate[]): QuestionResult[] {
  return questions.map((question) => {
    const answer = answers.find((candidate) => candidate.mappedQuestionId === question.id);
    return {
      ...question,
      status: answer?.status === 'matched' ? 'matched' : answer?.status === 'uncertain' ? 'uncertain' : 'unanswered',
      answer,
    };
  });
}
