import type { AnswerCandidate, Grading, Question } from './types';

function outputText(payload: unknown) {
  const record = payload as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (record.output_text) return record.output_text;
  return record.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? '').join('') ?? '';
}

export async function gradeAnswer(question: Question, answer: AnswerCandidate): Promise<Grading | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !question.marks) return undefined;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_GRADING_MODEL ?? 'gpt-5.4-mini',
      store: false,
      input: [{ role: 'user', content: [{ type: 'input_text', text: `Grade only after mapping. Question (${question.marks} marks): ${question.text}\nStudent answer: ${answer.text}` }] }],
      text: {
        format: {
          type: 'json_schema',
          name: 'answer_grade',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'number', minimum: 0, maximum: question.marks },
              maxScore: { type: 'number', const: question.marks },
              verdict: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              strengths: { type: 'array', items: { type: 'string' } },
              missingConcepts: { type: 'array', items: { type: 'string' } },
              feedback: { type: 'string' },
            },
            required: ['score', 'maxScore', 'verdict', 'confidence', 'strengths', 'missingConcepts', 'feedback'],
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Grading provider failed (${response.status}).`);
  return JSON.parse(outputText(await response.json())) as Grading;
}

