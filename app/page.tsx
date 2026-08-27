'use client';
/* eslint-disable @next/next/no-img-element -- Figma assets and the OCR document surface require intrinsic native-image sizing. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerCandidate, Polygon, ProcessingResult, ProgressEvent, QuestionResult } from '@/lib/veda/types';

type Screen = 'upload' | 'processing' | 'results';
type FileKind = 'question-paper' | 'answer-sheet';

function Sidebar({ compact = false }: { compact?: boolean }) {
  const menu = [['home.svg', 'Home'], ['classroom.svg', 'My Classroom'], ['assignments.svg', 'Assignments'], ['exams.svg', 'Exams'], ['library.svg', 'My Library']];
  return <aside className={`veda-sidebar ${compact ? 'is-compact' : ''}`}><div><div className="veda-brand"><img src="/assets/logo.svg" alt="VedaAI" />{!compact && <><span>VedaAI</span><img className="collapse-icon" src="/assets/collapse.svg" alt="Collapse" /></>}</div><button className="toolkit"><img src="/assets/teacher-toolkit.svg" alt="" />{!compact && <span>AI Teacher&apos;s Toolkit</span>}</button><nav className="veda-menu">{menu.map(([icon, label], index) => <button key={label} className={index === 3 ? 'active' : ''}><img src={`/assets/${icon}`} alt="" />{!compact && label}</button>)}</nav></div><div className="sidebar-bottom">{!compact && <div className="settings-row"><img src="/assets/settings.svg" alt="" />Settings</div>}<div className="school-card"><img src="/assets/school.png" alt="Delhi Public School" />{!compact && <span><strong>Delhi Public School</strong><small>Mathura Road</small></span>}</div>{compact && <button className="expand-sidebar">›</button>}</div></aside>;
}

function Topbar({ compact = false }: { compact?: boolean }) {
  return <><header className={`veda-topbar ${compact ? 'compact' : ''}`}><div className="navbar-context"><button type="button" className="navbar-back" aria-label="Go back"><img src="/assets/back.svg" alt="" /></button><div className="exam-context"><img src="/assets/exam-board.svg" alt="" /><span>Exams</span></div></div><div className="navbar-actions"><button type="button" className="navbar-action" aria-label="Help"><img src="/assets/help.svg" alt="" /></button><button type="button" className="navbar-action" aria-label="Notifications"><img src="/assets/notification.svg" alt="" /></button><button type="button" className="navbar-action" aria-label="AI tools"><img src="/assets/star.svg" alt="" /></button><button type="button" className="profile-control" aria-label="Open Madhur Rastogi profile"><img src="/assets/profile.svg" alt="Madhur Rastogi" /></button></div></header><nav className="mobile-navbar" aria-label="Mobile navigation"><img src="/assets/mobile-navbar.svg" alt="VedaAI" /><button type="button" className="mobile-nav-back" aria-label="Go back" /><button type="button" className="mobile-nav-notification" aria-label="Notifications" /><button type="button" className="mobile-nav-profile" aria-label="Open profile" /><button type="button" className="mobile-nav-menu" aria-label="Open menu" /></nav></>;
}

function TeacherOrb() { return <div className="teacher-orb"><img src="/assets/teacher-orb.png" alt="AI teacher" /></div>; }
function prettyBytes(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`; }

function UploadBox({ kind, file, onChange, onError }: { kind: FileKind; file?: File; onChange: (file?: File) => void; onError: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const answer = kind === 'answer-sheet';
  const choose = (candidate?: File) => {
    if (!candidate) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(candidate.type)) return onError('Only PDF, JPG, and PNG files are supported.');
    if (candidate.size > 10 * 1024 * 1024) return onError('Each file must be 10 MB or smaller.');
    onError(''); onChange(candidate);
  };
  return <div className={`upload-box ${file ? 'filled' : ''}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') input.current?.click(); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}>
    <input ref={input} hidden type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => choose(event.target.files?.[0])} />
    {file ? <><span className="pdf-icon">{file.type === 'application/pdf' ? 'PDF' : 'IMG'}</span><span className="file-name"><strong>{file.name}</strong><small>{prettyBytes(file.size)} &nbsp; • &nbsp; {file.type === 'application/pdf' ? 'PDF document' : '1 Page'}</small></span><button className="remove" type="button" aria-label={`Remove ${answer ? 'answer sheet' : 'question paper'}`} onClick={(event) => { event.stopPropagation(); onChange(undefined); }}>×</button></> : <><span className="upload-icon"><img src="/assets/upload.svg" alt="" /></span><span className="upload-label">Upload <b>{answer ? 'Answer Sheet' : 'Question Paper'}</b></span><small>Max 10MB</small></>}
  </div>;
}

function UploadScreen({ questionFile, answerFile, setQuestionFile, setAnswerFile, onStart, busy, error }: { questionFile?: File; answerFile?: File; setQuestionFile: (file?: File) => void; setAnswerFile: (file?: File) => void; onStart: () => void; busy: boolean; error: string }) {
  const [validation, setValidation] = useState('');
  const ready = Boolean(questionFile && answerFile);
  return <div className="veda-stage upload-stage"><Sidebar /><Topbar /><main className="upload-content"><div className="upload-title"><h1>Upload <span>Question Paper &amp; Answer Sheets</span></h1><p>Upload both files to get started</p></div><TeacherOrb /><div className="upload-tray"><UploadBox kind="question-paper" file={questionFile} onChange={setQuestionFile} onError={setValidation} /><UploadBox kind="answer-sheet" file={answerFile} onChange={setAnswerFile} onError={setValidation} /></div><div className="mapping-action"><button disabled={!ready || busy} onClick={onStart}>{busy ? 'Preparing…' : 'Start Mapping'} <img src="/assets/forward.svg" alt="" /></button><p>Once both files are uploaded, you’ll able to map answers with questions</p>{(validation || error) && <div className="form-error" role="alert">{validation || error}</div>}</div></main></div>;
}

function ProcessingScreen({ error, onBack }: { error: string; onBack: () => void }) {
  return <div className="veda-stage loading-stage"><Sidebar compact /><Topbar compact /><main className="loading-card"><div className={`processing-panel ${error ? 'has-error' : ''}`}><img className="loading-sparkles" src="/assets/loading-sparkles.svg" alt="" /><div className="loading-copy"><h1>{error ? 'Needs attention' : 'Extracting...'}</h1><p>{error || 'This may take a while'}</p></div>{error && <button className="back-upload" onClick={onBack}>Back to uploads</button>}</div></main></div>;
}

function polygonPoints(polygon: Polygon) { return polygon.map((point) => `${point.x},${point.y}`).join(' '); }
type PdfModule = { GlobalWorkerOptions: { workerSrc: string }; getDocument: (url: string) => { promise: Promise<{ numPages: number; getPage: (page: number) => Promise<{ getViewport: (options: { scale: number }) => { width: number; height: number }; render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }> }> } };

function SvgOverlay({ polygons, label, debug }: { polygons: Polygon[]; label?: string; debug: boolean }) {
  return <svg className={`answer-overlay ${debug ? 'debug' : ''}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-label={polygons.length ? `Highlighted answer for ${label}` : undefined}>{polygons.map((polygon, index) => <polygon key={index} points={polygonPoints(polygon)} />)}{polygons.length > 0 && <text x={Math.min(...polygons[0].map((point) => point.x))} y={Math.max(0.025, Math.min(...polygons[0].map((point) => point.y)) - 0.008)}>{label}</text>}</svg>;
}

function PdfPage({ url, page, polygons, label, zoom, debug, onPageCount }: { url: string; page: number; polygons: Polygon[]; label?: string; zoom: number; debug: boolean; onPageCount: (count: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => { let cancelled = false; const render = async () => { try { const pdfjs = await import('pdfjs-dist') as unknown as PdfModule; pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.mjs'; const document = await pdfjs.getDocument(url).promise; if (cancelled) return; onPageCount(document.numPages); const pdfPage = await document.getPage(Math.min(page, document.numPages)); const viewport = pdfPage.getViewport({ scale: 1.6 }); const target = canvas.current; if (!target || cancelled) return; target.width = viewport.width; target.height = viewport.height; const context = target.getContext('2d'); if (!context) throw new Error('Canvas is unavailable.'); await pdfPage.render({ canvasContext: context, viewport }).promise; } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not render this PDF.'); } }; void render(); return () => { cancelled = true; }; }, [url, page, onPageCount]);
  if (error) return <div className="viewer-error">{error}</div>;
  return <div className="rendered-page" style={{ width: `${zoom * 100}%` }}><canvas ref={canvas} /><SvgOverlay polygons={polygons} label={label} debug={debug} /></div>;
}

function DocumentViewer({ result, selected, debug }: { result: ProcessingResult; selected?: QuestionResult; debug: boolean }) {
  const regions = selected?.answer?.regions ?? [];
  const firstPage = regions[0]?.page ?? 1;
  const [page, setPage] = useState(firstPage);
  const [pageCount, setPageCount] = useState(result.documents.answerSheet.pageCount);
  const [zoom, setZoom] = useState(1);
  const polygons = regions.find((region) => region.page === page)?.polygons ?? [];
  const isPdf = result.documents.answerSheet.mimeType === 'application/pdf';
  const continuation = new Set(regions.map((region) => region.page)).size > 1;
  const onPageCount = useCallback((count: number) => setPageCount(count), []);
  return <section className="answer-column"><header><strong>Answer Sheet</strong><div className="zoom"><button onClick={() => setZoom(Math.max(0.6, zoom - 0.1))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(2, zoom + 0.1))}>+</button></div><div className="pager"><button onClick={() => setPage(Math.max(1, page - 1))}>‹</button><span>Page {page} of {pageCount}</span><button onClick={() => setPage(Math.min(pageCount, page + 1))}>›</button></div></header>{selected?.status === 'unanswered' && <div className="no-answer"><strong>No answer detected for Q{selected.number}.</strong><span>Nearby writing has not been highlighted because there is no reliable mapping.</span></div>}{selected?.status === 'uncertain' && <div className="uncertain-banner">This mapping needs teacher review ({Math.round((selected.answer?.mappingConfidence ?? 0) * 100)}% confidence).</div>}{continuation && <div className="continuation-banner">Answer spans pages {regions.map((region) => region.page).join(', ')}</div>}<div className="viewer-scroll">{isPdf ? <PdfPage url={result.documents.answerSheet.url} page={page} polygons={polygons} label={selected ? `Q${selected.number}` : undefined} zoom={zoom} debug={debug} onPageCount={onPageCount} /> : <div className="rendered-page image" style={{ width: `${zoom * 100}%` }}><img src={result.documents.answerSheet.url} alt={`Answer sheet page ${page}`} /><SvgOverlay polygons={polygons} label={selected ? `Q${selected.number}` : undefined} debug={debug} /></div>}</div></section>;
}

function statusLabel(question: QuestionResult) { if (question.grading) return `${question.grading.score} / ${question.grading.maxScore}`; return question.status === 'matched' ? 'Answered' : question.status === 'uncertain' ? 'Review' : 'Unanswered'; }
function statusTone(question: QuestionResult) { if (question.status === 'unanswered') return 'bad'; if (question.status === 'uncertain') return 'warn'; if (question.grading && question.grading.score < question.grading.maxScore * 0.7) return 'warn'; return 'good'; }

function MappingControl({ answer, questions, onRemap }: { answer: AnswerCandidate; questions: QuestionResult[]; onRemap: (answerId: string, questionId: string | null) => void }) {
  return <label className="mapping-control"><span>Change mapping</span><select value={answer.mappedQuestionId ?? ''} onChange={(event) => onRemap(answer.id, event.target.value || null)}><option value="">Unmatched</option>{questions.map((question) => <option key={question.id} value={question.id}>Q{question.number}</option>)}</select></label>;
}

function QuestionCard({ question, open, selected, onClick, questions, onRemap, debug }: { question: QuestionResult; open: boolean; selected: boolean; onClick: () => void; questions: QuestionResult[]; onRemap: (answerId: string, questionId: string | null) => void; debug: boolean }) {
  return <div className={`question-card ${open ? 'open' : ''} ${selected ? 'selected' : ''}`} role="button" tabIndex={0} onClick={onClick} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onClick(); }}><span className="q-number">{question.number}</span><span className="q-text">{question.text}</span><span className={`q-score ${statusTone(question)}`}>{statusLabel(question)}</span><span className="chevron">⌄</span>{open && <span className="ai-feedback" onClick={(event) => event.stopPropagation()}><strong>{question.status === 'unanswered' ? 'No answer detected' : question.status === 'uncertain' ? 'Teacher review required' : 'AI Feedback'}</strong>{question.answer?.text && <small className="transcription"><b>Transcription:</b> {question.answer.text}</small>}<small>{question.grading?.feedback ?? (question.status === 'unanswered' ? 'The system did not find a suitable answer region and has not guessed.' : 'Confirm this mapping or choose a different question.')}</small>{question.answer && (question.status === 'uncertain' || debug) && <MappingControl answer={question.answer} questions={questions} onRemap={onRemap} />}{debug && question.answer && <small className="debug-copy">confidence={question.answer.mappingConfidence.toFixed(3)} • method={question.answer.mappingMethod}</small>}</span>}</div>;
}

function ResultsScreen({ result, debug, onRestart, onResult }: { result: ProcessingResult; debug: boolean; onRestart: () => void; onResult: (result: ProcessingResult) => void }) {
  const [open, setOpen] = useState<string | undefined>(result.questions[0]?.id);
  const [selectedId, setSelectedId] = useState(result.questions.find((question) => question.status === 'matched')?.id ?? result.questions[0]?.id);
  const [selectedUnmatchedId, setSelectedUnmatchedId] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const selectedQuestion = result.questions.find((question) => question.id === selectedId);
  const selectedUnmatched = result.unmatchedAnswers.find((answer) => answer.id === selectedUnmatchedId);
  const selected: QuestionResult | undefined = selectedQuestion ?? (selectedUnmatched ? {
    id: `unmatched-${selectedUnmatched.id}`, number: 'Unknown', normalizedNumber: 'unknown', order: 0,
    text: 'Unmatched student response', page: selectedUnmatched.regions[0]?.page ?? 1,
    sourcePolygons: [], confidence: selectedUnmatched.mappingConfidence, status: 'uncertain', answer: selectedUnmatched,
  } : undefined);
  const remap = async (answerId: string, questionId: string | null) => { const response = await fetch(`/api/session/${result.sessionId}/mapping`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answerId, questionId }) }); if (response.ok) onResult(await response.json() as ProcessingResult); };
  return <div className="veda-stage mapping-stage"><Sidebar compact /><Topbar compact /><main className="mapping-grid"><section className="questions-column"><header><div><strong>Extracted Questions</strong><small>{result.metrics.matched} answered • {result.metrics.unanswered} unanswered • {result.metrics.uncertain} review</small></div><button onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse All' : 'Expand All'}</button></header>{result.warnings.length > 0 && <div className="provider-warning">Processing note: {result.warnings.join(' ')}</div>}<div className="question-stack">{result.questions.map((question) => <QuestionCard key={question.id} question={question} open={expanded || open === question.id} selected={selectedId === question.id} onClick={() => { setOpen(open === question.id ? undefined : question.id); setSelectedId(question.id); setSelectedUnmatchedId(undefined); }} questions={result.questions} onRemap={remap} debug={debug} />)}</div><div className="unmatched-section"><h3>Unmatched responses <span>{result.unmatchedAnswers.length}</span></h3>{result.unmatchedAnswers.length === 0 ? <p>No unmatched writing detected.</p> : result.unmatchedAnswers.map((answer) => <div className={`unmatched-card ${selectedUnmatchedId === answer.id ? 'selected' : ''}`} key={answer.id} onClick={() => { setSelectedId(''); setSelectedUnmatchedId(answer.id); }}><strong>Unknown response • Page {answer.regions[0]?.page ?? '—'}</strong><small>{answer.text || 'Untranscribed writing'}</small><span>Best confidence: {Math.round(answer.mappingConfidence * 100)}%</span><MappingControl answer={answer} questions={result.questions} onRemap={remap} /></div>)}</div></section><DocumentViewer key={selected?.id ?? 'none'} result={result} selected={selected} debug={debug} /></main><button className="restart" onClick={onRestart} aria-label="Restart flow">↻</button></div>;
}

async function uploadDocument(sessionId: string, kind: FileKind, file: File) { const body = new FormData(); body.append('file', file); const response = await fetch(`/api/session/${sessionId}/${kind}`, { method: 'POST', body }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error ?? 'Upload failed.'); }
async function processWithStream(sessionId: string, onProgress: (progress: ProgressEvent) => void) {
  const response = await fetch(`/api/session/${sessionId}/process`, { method: 'POST' });
  if (!response.ok || !response.body) { const payload = await response.json() as { error?: string }; throw new Error(payload.error ?? 'Processing could not start.'); }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const messages = buffer.split('\n\n'); buffer = messages.pop() ?? ''; for (const message of messages) { const event = message.match(/^event:\s*(.+)$/m)?.[1]; const data = message.match(/^data:\s*(.+)$/m)?.[1]; if (!data) continue; const payload = JSON.parse(data) as { error?: string } | ProgressEvent; if (event === 'progress') onProgress(payload as ProgressEvent); if (event === 'error') throw new Error((payload as { error?: string }).error ?? 'Processing failed.'); } }
}

const emptyProgress: ProgressEvent = { percent: 0, stage: 'upload_received', label: 'Waiting for files', at: new Date(0).toISOString() };

export default function Home() {
  const [screen, setScreen] = useState<Screen>('upload'); const [questionFile, setQuestionFile] = useState<File>(); const [answerFile, setAnswerFile] = useState<File>(); const [, setProgress] = useState<ProgressEvent>(emptyProgress); const [result, setResult] = useState<ProcessingResult>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true';
  const run = async (demo: boolean) => { setBusy(true); setError(''); setProgress(emptyProgress); setScreen('processing'); try { const created = await fetch(`/api/session${demo ? '?demo=true' : ''}`, { method: 'POST' }); const payload = await created.json() as { session?: { id: string }; error?: string }; if (!created.ok || !payload.session) throw new Error(payload.error ?? 'Could not create a processing session.'); const sessionId = payload.session.id; if (!demo) { if (!questionFile || !answerFile) throw new Error('Choose both files first.'); await uploadDocument(sessionId, 'question-paper', questionFile); await uploadDocument(sessionId, 'answer-sheet', answerFile); } await processWithStream(sessionId, setProgress); const resultsResponse = await fetch(`/api/session/${sessionId}/results${debug ? '?debug=true' : ''}`); const resultsPayload = await resultsResponse.json() as ProcessingResult & { error?: string }; if (!resultsResponse.ok) throw new Error(resultsPayload.error ?? 'Results are not ready.'); setResult(resultsPayload); setScreen('results'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong.'); } finally { setBusy(false); } };
  const restart = () => { setResult(undefined); setProgress(emptyProgress); setError(''); setQuestionFile(undefined); setAnswerFile(undefined); setScreen('upload'); };
  if (screen === 'processing') return <ProcessingScreen error={error} onBack={() => setScreen('upload')} />;
  if (screen === 'results' && result) return <ResultsScreen result={result} debug={debug} onRestart={restart} onResult={setResult} />;
  return <UploadScreen questionFile={questionFile} answerFile={answerFile} setQuestionFile={setQuestionFile} setAnswerFile={setAnswerFile} onStart={() => void run(false)} busy={busy} error={error} />;
}
