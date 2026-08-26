import { SESSION_TTL_MS } from './config';
import type { ProcessingSession, ProgressEvent, UploadedDocument } from './types';

const globalStore = globalThis as typeof globalThis & {
  __vedaSessions?: Map<string, ProcessingSession>;
};

const sessions = globalStore.__vedaSessions ?? new Map<string, ProcessingSession>();
globalStore.__vedaSessions = sessions;

const firstProgress = (): ProgressEvent => ({
  percent: 0,
  stage: 'upload_received',
  label: 'Waiting for files',
  at: new Date().toISOString(),
});

export function cleanupSessions(now = Date.now()) {
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

export function createSession(demo = false): ProcessingSession {
  cleanupSessions();
  const now = Date.now();
  const session: ProcessingSession = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    demo,
    status: demo ? 'ready' : 'created',
    progress: firstProgress(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string) {
  cleanupSessions();
  return sessions.get(id);
}

export function requireSession(id: string) {
  const session = getSession(id);
  if (!session) throw new Error('Session not found or expired.');
  return session;
}

export function attachDocument(
  id: string,
  kind: 'questionPaper' | 'answerSheet',
  document: UploadedDocument,
) {
  const session = requireSession(id);
  session[kind] = document;
  session.updatedAt = Date.now();
  if (session.questionPaper && session.answerSheet) session.status = 'ready';
  return session;
}

export function updateProgress(id: string, progress: ProgressEvent) {
  const session = requireSession(id);
  session.progress = progress;
  session.updatedAt = Date.now();
  return session;
}

export function publicSession(session: ProcessingSession) {
  const summarize = (document?: UploadedDocument) =>
    document
      ? {
          name: document.name,
          mimeType: document.mimeType,
          size: document.size,
          pageCount: document.pageCount,
        }
      : undefined;
  return {
    id: session.id,
    demo: session.demo,
    status: session.status,
    progress: session.progress,
    questionPaper: summarize(session.questionPaper),
    answerSheet: summarize(session.answerSheet),
    error: session.error,
  };
}

