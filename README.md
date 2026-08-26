# VedaAI Answer Mapping

Accuracy-first teacher review software built from the supplied Figma. The application accepts a question paper and handwritten answer sheet, runs observable OCR/mapping stages on the Next.js backend, and renders normalized OCR polygons as SVG highlights over the original document.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`. The **audited demo** exercises the complete workflow without API credentials. Real document processing requires at least one OCR provider in `.env.local`; copy `.env.example` and add server-side credentials.

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Accuracy boundaries

- OCR providers determine text and geometry. Reasoning never creates highlight coordinates.
- Coordinates are normalized to `0..1` and rendered with responsive SVG overlays.
- Mapping uses explicit numbering, semantic evidence, sequence evidence, OCR confidence, and global one-to-one assignment.
- `matched`, `unanswered`, `unmatched`, and `uncertain` are distinct outcomes. Low-confidence writing is not forced onto a question.
- Provider failures degrade confidence and are surfaced in results. If every configured provider fails, processing stops with an actionable error.
- Grading runs only after mapping and cannot mutate it.

## Backend stages

The implementation is separated into typed services in `lib/veda`:

1. document validation and normalization;
2. provider-specific OCR adapters for Mistral OCR, Azure Document Intelligence Read, and Google Vision;
3. OCR consensus with geometry preservation;
4. deterministic question-number and hierarchy extraction;
5. answer-anchor segmentation and multi-page region grouping;
6. configurable scoring and Hungarian global assignment;
7. uncertainty handling and optional OpenAI grading;
8. result preparation and SVG highlighting.

The processing endpoint streams real stage events over HTTP using the SSE format. Sessions and uploaded bytes are intentionally temporary and held server-side, matching the assignment's no-database requirement; stale sessions expire after two hours.

## API

```text
POST  /api/session
POST  /api/session?demo=true
POST  /api/session/:id/question-paper
POST  /api/session/:id/answer-sheet
POST  /api/session/:id/process
GET   /api/session/:id/progress
GET   /api/session/:id/results
GET   /api/session/:id/document/:type
PATCH /api/session/:id/mapping
```

Append `?debug=true` to the app and results endpoint to expose mapping confidence, methods, and debug overlay styling.

## Provider notes

- Mistral uses the official `/v1/ocr` endpoint with `mistral-ocr-latest`, block geometry, and block confidence.
- Azure uses the v4.0 `prebuilt-read` model with high-resolution OCR and polls its operation URL.
- Google uses `DOCUMENT_TEXT_DETECTION` for image uploads. Synchronous Google PDF OCR is deliberately skipped so PDFs can continue through Azure/Mistral rather than failing the pipeline.
- OpenAI grading uses strict JSON schema output and `store: false`.

Do not commit `.env.local` or provider credentials.

