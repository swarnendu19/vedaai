import type { OCRLine, Question } from './types';

const MAIN_NUMBER = /^\s*(?:(?:q(?:uestion)?\.?\s*(?:(?:no|number)\.?\s*)?|ans(?:wer)?\.?\s*))?(\d{1,3})(?:\s*(?:\(\s*([a-z])\s*\)|-\s*([a-z])\b|([a-z])(?=\s*(?:[.):-]|\(|$))))?(?:\s*\(\s*((?:i{1,3}|iv|v|vi{0,3}|ix|x))\s*\))?\s*[.):-]?\s*(.*)$/i;
const LETTER_ONLY = /^\s*\(?\s*([a-z])\s*\)\s*[.):-]?\s*(.*)$/i;
const ROMAN_ONLY = /^\s*\(?\s*((?:i{1,3}|iv|v|vi{0,3}|ix|x))\s*\)\s*[.):-]?\s*(.*)$/i;

export function normalizeQuestionNumber(raw: string) {
  const source = raw
    .toLowerCase()
    .replace(/^(?:q(?:uestion)?|ans(?:wer)?)\.?\s*/, '')
    .replace(/[\[\]]/g, '')
    .replace(/\s*[-.]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const main = source.match(/^(\d{1,3})\s*\(?\s*([a-z])?\s*\)?\s*\(?\s*((?:i{1,3}|iv|v|vi{0,3}|ix|x))?\s*\)?$/i);
  if (!main) return source.replace(/\s+/g, '');
  return `${main[1]}${main[2] ? `(${main[2]})` : ''}${main[3] ? `(${main[3]})` : ''}`;
}

function extractMarks(text: string) {
  const match = text.match(/(?:\[\s*(\d+)\s*\]|\(\s*(\d+)\s*marks?\s*\))\s*$/i);
  const marks = match ? Number(match[1] ?? match[2]) : undefined;
  return { marks, text: match ? text.slice(0, match.index).trim() : text.trim() };
}

function looksLikeInstruction(text: string) {
  return /^(?:answer|attempt|solve|do)\s+(?:the\s+)?following\b/i.test(text) || /following\s*:?$/i.test(text);
}

export function extractQuestionsFromLines(lines: OCRLine[]): Question[] {
  const ordered = lines.slice().sort((a, b) => a.page - b.page || top(a) - top(b));
  const questions: Question[] = [];
  let active: Question | undefined;
  let currentParent: string | undefined;
  let currentLetter: string | undefined;

  const push = (number: string, display: string, text: string, line: OCRLine, parentNumber?: string) => {
    const parsed = extractMarks(text);
    const question: Question = {
      id: `q-${number}-${questions.length + 1}`,
      number: display,
      normalizedNumber: number,
      parentNumber,
      order: questions.length + 1,
      text: parsed.text,
      marks: parsed.marks,
      page: line.page,
      sourcePolygons: line.polygon.length ? [line.polygon] : [],
      confidence: line.confidence,
    };
    questions.push(question);
    active = question;
    return question;
  };

  for (const line of ordered) {
    const text = line.text
      .replace(/^\s*(?:#{1,6}|>|[-*+]\s+)\s*/, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const main = text.match(MAIN_NUMBER);
    if (main) {
      const number = main[1];
      const letter = main[2] ?? main[3] ?? main[4];
      const roman = main[5];
      const body = main[6] ?? '';
      currentParent = number;
      currentLetter = letter?.toLowerCase();
      const normalized = normalizeQuestionNumber(`${number}${letter ? `(${letter})` : ''}${roman ? `(${roman})` : ''}`);
      push(normalized, normalized, body, line, letter || roman ? number : undefined);
      continue;
    }
    const letter = text.match(LETTER_ONLY);
    if (letter && currentParent) {
      currentLetter = letter[1].toLowerCase();
      const normalized = `${currentParent}(${currentLetter})`;
      if (active?.normalizedNumber === currentParent && looksLikeInstruction(active.text)) {
        questions.pop();
      }
      push(normalized, normalized, letter[2], line, currentParent);
      continue;
    }
    const roman = text.match(ROMAN_ONLY);
    if (roman && currentParent) {
      const normalized = `${currentParent}${currentLetter ? `(${currentLetter})` : ''}(${roman[1].toLowerCase()})`;
      push(normalized, normalized, roman[2], line, currentParent);
      continue;
    }
    if (active) {
      const parsed = extractMarks(`${active.text} ${text}`);
      active.text = parsed.text;
      active.marks ??= parsed.marks;
      active.confidence = Math.min(active.confidence, line.confidence);
      if (line.polygon.length) active.sourcePolygons.push(line.polygon);
    }
  }

  return questions
    .filter((question) => question.text.length > 2 && !looksLikeInstruction(question.text))
    .map((question, index) => ({ ...question, order: index + 1 }));
}

function top(line: OCRLine) {
  return line.polygon.length ? Math.min(...line.polygon.map((point) => point.y)) : 0;
}
