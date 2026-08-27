import { configuredProviderNames } from '@/lib/veda/providers';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    status: 'ok',
    processingTransport: 'single-request-sse',
    providers: configuredProviderNames(),
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
