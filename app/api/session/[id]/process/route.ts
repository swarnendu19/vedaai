import { uploadedDocumentFromFile } from '@/lib/veda/documents';
import { processSession } from '@/lib/veda/pipeline';
import { publicResult } from '@/lib/veda/results';
import { getSession } from '@/lib/veda/session-store';
import type { ProcessingSession, ProgressEvent } from '@/lib/veda/types';

export const maxDuration = 300;

function initialSession(id: string, demo: boolean): ProcessingSession {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    demo,
    status: demo ? 'ready' : 'created',
    progress: { percent: 0, stage: 'upload_received', label: 'Waiting for files', at: new Date().toISOString() },
  };
}

async function sessionFromRequest(request: Request, id: string) {
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) return getSession(id);
  const form = await request.formData();
  const demo = form.get('demo') === 'true';
  const session = initialSession(id, demo);
  if (!demo) {
    const questionPaper = form.get('questionPaper');
    const answerSheet = form.get('answerSheet');
    if (!(questionPaper instanceof File) || !(answerSheet instanceof File)) {
      throw new Error('Both questionPaper and answerSheet files are required.');
    }
    session.questionPaper = await uploadedDocumentFromFile(questionPaper);
    session.answerSheet = await uploadedDocumentFromFile(answerSheet);
    session.status = 'ready';
  }
  return session;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session: ProcessingSession | undefined;
  try {
    session = await sessionFromRequest(request, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The uploaded documents could not be read.';
    return Response.json({ error: message }, { status: 400 });
  }
  if (!session) return Response.json({ error: 'Session not found or expired. Start a new upload and try again.' }, { status: 404 });
  if (!session.demo && (!session.questionPaper || !session.answerSheet)) {
    return Response.json({ error: 'Upload both documents before processing.' }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      session.status = 'processing';
      session.error = undefined;
      console.info('[veda-processing]', JSON.stringify({ sessionId: id, event: 'processing_started', demo: session.demo }));
      void processSession(session, (progress) => {
        session.progress = progress;
        session.updatedAt = Date.now();
        send('progress', progress);
      }).then((result) => {
        session.result = result;
        session.status = 'complete';
        session.updatedAt = Date.now();
        console.info('[veda-processing]', JSON.stringify({ sessionId: id, event: 'processing_complete', ...result.metrics }));
        send('complete', { result: publicResult(result, new URL(request.url).searchParams.get('debug') === 'true') });
        controller.close();
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Processing failed.';
        session.status = 'failed';
        session.error = message;
        session.updatedAt = Date.now();
        console.error('[veda-processing]', JSON.stringify({ sessionId: id, event: 'processing_failed', message }));
        const progress: ProgressEvent = { percent: session.progress.percent, stage: 'failed', label: 'Processing failed', detail: message, at: new Date().toISOString() };
        session.progress = progress;
        send('error', { error: message, progress });
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
