import { getSession } from '@/lib/veda/session-store';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return Response.json({ error: 'Session not found or expired.' }, { status: 404 });
  return Response.json({ status: session.status, progress: session.progress, error: session.error });
}

