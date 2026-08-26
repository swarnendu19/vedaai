import { uploadedDocumentFromFile } from '@/lib/veda/documents';
import { attachDocument, getSession, publicSession } from '@/lib/veda/session-store';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!getSession(id)) return Response.json({ error: 'Session not found or expired.' }, { status: 404 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ error: 'A file field is required.' }, { status: 400 });
    const session = attachDocument(id, 'questionPaper', await uploadedDocumentFromFile(file));
    return Response.json({ session: publicSession(session) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 400 });
  }
}

