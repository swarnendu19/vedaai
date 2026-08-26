import { getSession } from '@/lib/veda/session-store';
import type { ProcessingResult } from '@/lib/veda/types';

function publicResult(result: ProcessingResult, debug: boolean): ProcessingResult {
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return Response.json({ error: 'Session not found or expired.' }, { status: 404 });
  if (!session.result) return Response.json({ error: 'Results are not ready.', status: session.status }, { status: 409 });
  return Response.json(publicResult(session.result, new URL(request.url).searchParams.get('debug') === 'true'));
}

