import { configuredProviderNames } from '@/lib/veda/providers';
import { createSession, publicSession } from '@/lib/veda/session-store';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const session = createSession(url.searchParams.get('demo') === 'true');
  return Response.json({ session: publicSession(session), providers: configuredProviderNames() }, { status: 201 });
}

