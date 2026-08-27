import type { ProcessingResult } from './types';

export function publicResult(result: ProcessingResult, debug = false): ProcessingResult {
  if (debug) return result;
  return {
    ...result,
    questions: result.questions.map((question) => ({
      ...question,
      answer: question.answer ? { ...question.answer, lines: [], candidateScores: undefined } : undefined,
    })),
    unmatchedAnswers: result.unmatchedAnswers.map((answer) => ({ ...answer, lines: [], candidateScores: undefined })),
  };
}
