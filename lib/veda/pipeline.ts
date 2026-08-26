import { demoResult } from './demo-fixture';
import { gradeAnswer } from './grading';
import { buildQuestionResults, mapAnswers, segmentAnswers } from './mapping';
import { buildOCRConsensus, runAzureOCR, runGoogleOCR, runMistralOCR } from './providers';
import { extractQuestionsFromLines } from './questions';
import type { OCRPage, ProcessingResult, ProcessingSession, ProgressEvent, ProgressStage, UploadedDocument } from './types';

export type ProgressEmitter = (event: ProgressEvent) => void | Promise<void>;

const STAGES: Array<[number, ProgressStage, string]> = [
  [5, 'upload_received', 'Uploads received'],
  [10, 'preparing_documents', 'Preparing documents'],
  [20, 'reading_question_paper', 'Reading question paper'],
  [35, 'extracting_questions', 'Extracting questions'],
  [45, 'reading_answer_sheet', 'Reading handwriting'],
  [60, 'detecting_answer_regions', 'Detecting answer regions'],
  [72, 'matching_answers', 'Matching answers'],
  [82, 'verifying_mappings', 'Verifying uncertain mappings'],
  [90, 'grading', 'Generating feedback'],
  [96, 'preparing_highlights', 'Preparing highlights'],
  [100, 'complete', 'Complete'],
];

async function progress(emit: ProgressEmitter, index: number, detail?: string) {
  const [percent, stage, label] = STAGES[index];
  const event = { percent, stage, label, detail, at: new Date().toISOString() };
  await emit(event);
  return event;
}

async function runProviders(document: UploadedDocument, includeGoogle: boolean) {
  const jobs: Array<Promise<OCRPage[]>> = [];
  if (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY) jobs.push(runAzureOCR(document));
  if (process.env.MISTRAL_API_KEY) jobs.push(runMistralOCR(document));
  if (includeGoogle && process.env.GOOGLE_CLOUD_VISION_API_KEY) jobs.push(runGoogleOCR(document));
  if (!jobs.length) throw new Error('No OCR provider is configured. Add Mistral, Azure, or Google credentials to the server environment, or use the built-in demo.');
  const settled = await Promise.allSettled(jobs);
  const pages = settled.filter((item): item is PromiseFulfilledResult<OCRPage[]> => item.status === 'fulfilled').map((item) => item.value);
  const warnings = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected').map((item) => item.reason instanceof Error ? item.reason.message : String(item.reason));
  if (!pages.length) throw new Error(`All OCR providers failed. ${warnings.join(' ')}`);
  return { pages, warnings };
}

function documentSummary(sessionId: string, kind: 'question-paper' | 'answer-sheet', document: UploadedDocument) {
  return {
    name: document.name,
    mimeType: document.mimeType,
    size: document.size,
    pageCount: document.pageCount,
    url: `/api/session/${sessionId}/document/${kind}`,
  };
}

export async function processSession(session: ProcessingSession, emit: ProgressEmitter): Promise<ProcessingResult> {
  await progress(emit, 0);
  await progress(emit, 1);
  if (session.demo) {
    for (let index = 2; index < STAGES.length - 1; index += 1) {
      await progress(emit, index, index === 3 ? '14 questions found' : undefined);
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    const result = demoResult(session.id);
    await progress(emit, STAGES.length - 1, '14 questions reviewed');
    return result;
  }
  if (!session.questionPaper || !session.answerSheet) throw new Error('Upload both documents before processing.');

  await progress(emit, 2);
  const questionOCR = await runProviders(session.questionPaper, session.questionPaper.mimeType !== 'application/pdf');
  const questionPages = questionOCR.pages.find((pages) => pages[0]?.provider === 'mistral') ?? buildOCRConsensus(questionOCR.pages);
  await progress(emit, 3);
  const questions = extractQuestionsFromLines(questionPages.flatMap((page) => page.lines));
  if (!questions.length) throw new Error('No reliable question structure was detected. Review the scan or configure Mistral OCR.');

  await progress(emit, 4, `${questions.length} questions found`);
  const answerOCR = await runProviders(session.answerSheet, session.answerSheet.mimeType !== 'application/pdf');
  const answerPages = buildOCRConsensus(answerOCR.pages);
  await progress(emit, 5);
  const candidates = segmentAnswers(answerPages);
  await progress(emit, 6, `${candidates.length} answer candidates found`);
  const mapped = mapAnswers(questions, candidates);
  await progress(emit, 7);
  const questionResults = buildQuestionResults(questions, mapped);

  await progress(emit, 8);
  if (process.env.OPENAI_API_KEY) {
    for (const question of questionResults) {
      if (question.status !== 'matched' || !question.answer) continue;
      try { question.grading = await gradeAnswer(question, question.answer); }
      catch (error) { answerOCR.warnings.push(error instanceof Error ? error.message : String(error)); }
    }
  }
  await progress(emit, 9);
  const unmatchedAnswers = mapped.filter((answer) => answer.status === 'unmatched');
  const result: ProcessingResult = {
    sessionId: session.id,
    createdAt: new Date().toISOString(),
    questions: questionResults,
    unmatchedAnswers,
    documents: {
      questionPaper: documentSummary(session.id, 'question-paper', session.questionPaper),
      answerSheet: documentSummary(session.id, 'answer-sheet', session.answerSheet),
    },
    warnings: [...questionOCR.warnings, ...answerOCR.warnings],
    metrics: {
      matched: questionResults.filter((question) => question.status === 'matched').length,
      unanswered: questionResults.filter((question) => question.status === 'unanswered').length,
      uncertain: questionResults.filter((question) => question.status === 'uncertain').length,
      unmatched: unmatchedAnswers.length,
    },
  };
  await progress(emit, 10, `${questions.length} questions reviewed`);
  return result;
}
