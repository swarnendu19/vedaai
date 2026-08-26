import { processSession } from '@/lib/veda/pipeline';
import { getSession, updateProgress } from '@/lib/veda/session-store';

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return Response.json({ error: 'Session not found or expired.' }, { status: 404 });
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
        updateProgress(id, progress);
        send('progress', progress);
      }).then((result) => {
        session.result = result;
        session.status = 'complete';
        session.updatedAt = Date.now();
        console.info('[veda-processing]', JSON.stringify({ sessionId: id, event: 'processing_complete', ...result.metrics }));
        send('complete', { sessionId: id, metrics: result.metrics });
        controller.close();
      }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Processing failed.';
        session.status = 'failed';
        session.error = message;
        session.updatedAt = Date.now();
        console.error('[veda-processing]', JSON.stringify({ sessionId: id, event: 'processing_failed', message }));
        const progress = { percent: session.progress.percent, stage: 'failed' as const, label: 'Processing failed', detail: message, at: new Date().toISOString() };
        updateProgress(id, progress);
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
