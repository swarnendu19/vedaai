import { getSession } from '@/lib/veda/session-store';
import { bytesToArrayBuffer } from '@/lib/veda/documents';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await params;
  const session = getSession(id);
  if (!session) return Response.json({ error: 'Session not found or expired.' }, { status: 404 });
  const document = type === 'question-paper' ? session.questionPaper : type === 'answer-sheet' ? session.answerSheet : undefined;
  if (!document) return Response.json({ error: 'Document not found.' }, { status: 404 });
  return new Response(bytesToArrayBuffer(document.bytes), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Length': String(document.size),
      'Content-Disposition': `inline; filename="${document.name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
