import { getSession } from '@/lib/veda/session-store';
import { publicResult } from '@/lib/veda/results';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return Response.json({ error: 'Session not found or expired.' }, { status: 404 });
  if (!session.result) return Response.json({ error: 'Results are not ready.', status: session.status }, { status: 409 });
  return Response.json(publicResult(session.result, new URL(request.url).searchParams.get('debug') === 'true'));
}
