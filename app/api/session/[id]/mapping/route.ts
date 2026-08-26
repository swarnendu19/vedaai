import { getSession } from '@/lib/veda/session-store';
import type { AnswerCandidate } from '@/lib/veda/types';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session?.result) return Response.json({ error: 'Results are not ready.' }, { status: 409 });
  const body = await request.json() as { answerId?: string; questionId?: string | null };
  if (!body.answerId) return Response.json({ error: 'answerId is required.' }, { status: 400 });
  const candidates: AnswerCandidate[] = [
    ...session.result.questions.flatMap((question) => question.answer ? [question.answer] : []),
    ...session.result.unmatchedAnswers,
  ];
  const answer = candidates.find((candidate) => candidate.id === body.answerId);
  if (!answer) return Response.json({ error: 'Answer candidate not found.' }, { status: 404 });

  for (const question of session.result.questions) {
    if (question.answer?.id === answer.id) {
      question.answer = undefined;
      question.status = 'unanswered';
      question.grading = undefined;
    }
  }
  session.result.unmatchedAnswers = session.result.unmatchedAnswers.filter((candidate) => candidate.id !== answer.id);
  if (body.questionId) {
    const target = session.result.questions.find((question) => question.id === body.questionId);
    if (!target) return Response.json({ error: 'Target question not found.' }, { status: 404 });
    if (target.answer && target.answer.id !== answer.id) {
      target.answer.status = 'unmatched';
      target.answer.mappedQuestionId = undefined;
      session.result.unmatchedAnswers.push(target.answer);
    }
    answer.status = 'matched';
    answer.mappedQuestionId = target.id;
    answer.mappingConfidence = 1;
    answer.mappingMethod = 'teacher_manual_correction';
    target.answer = answer;
    target.status = 'matched';
  } else {
    answer.status = 'unmatched';
    answer.mappedQuestionId = undefined;
    answer.mappingConfidence = 1;
    answer.mappingMethod = 'teacher_marked_unmatched';
    session.result.unmatchedAnswers.push(answer);
  }
  const result = session.result;
  result.metrics = {
    matched: result.questions.filter((question) => question.status === 'matched').length,
    unanswered: result.questions.filter((question) => question.status === 'unanswered').length,
    uncertain: result.questions.filter((question) => question.status === 'uncertain').length,
    unmatched: result.unmatchedAnswers.length,
  };
  session.updatedAt = Date.now();
  return Response.json(result);
}

