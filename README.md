# VedaAI Answer Mapping

VedaAI is an accuracy-first teacher review application for mapping scanned question papers to handwritten answer sheets. It accepts PDF, PNG, and JPEG documents, preserves OCR geometry, separates uncertain results from reliable matches, and renders reviewable highlights over the original answer sheet.

## Technical stack

- Next.js 16 App Router with React 19 and TypeScript
- Next.js route handlers for uploads, processing, progress events, review, and remapping
- Mistral OCR as the primary question-paper reader
- Optional Azure Document Intelligence and Google Cloud Vision OCR providers
- Optional OpenAI grading after answer mapping is complete
- PDF.js for browser-side PDF rendering
- Normalized SVG polygons for document highlights
- Node.js 22 and pnpm 9.5

## Processing pipeline

The processing pipeline is implemented as typed, independent services in `lib/veda`. The `/api/session/:id/process` endpoint streams stage updates to the browser using Server-Sent Events while the following work runs:

1. **Upload validation** — validates MIME type and enforces a 10 MB limit for each question paper and answer sheet.
2. **Document preparation** — stores the original bytes in the temporary session so the review screen can render the exact uploaded document.
3. **Question-paper OCR** — runs every configured OCR provider. When Mistral returns usable pages, its structured markdown and blocks are used as the primary question source.
4. **Question extraction** — normalizes common prefixes such as `1.`, `Q1`, `Question 1`, and hierarchical subparts. Parent instructions are kept separate from answerable subquestions.
5. **Answer-sheet OCR** — reads handwriting and retains page numbers, text confidence, and normalized `0..1` polygons.
6. **OCR consensus** — chooses the provider with the strongest geometry and adjusts confidence when overlapping providers agree or disagree.
7. **Answer segmentation** — detects numbered answer anchors, groups continuation lines, and preserves regions spanning multiple pages.
8. **Candidate scoring** — scores every answer/question pair using explicit numbering, semantic similarity, document order, and OCR confidence.
9. **Global assignment** — applies a Hungarian maximum-weight assignment so multiple answers cannot be mapped to the same question accidentally.
10. **Uncertainty handling** — classifies results as `matched`, `uncertain`, `unmatched`, or `unanswered`. Low-confidence writing is never forced into a match.
11. **Optional grading** — grades only accepted matches and cannot modify the mapping or source coordinates.
12. **Review preparation** — returns questions, answer candidates, warnings, metrics, original-document URLs, and polygons for the review interface.

### Accuracy controls

The default pair score is weighted as follows:

| Signal | Weight |
| --- | ---: |
| Explicit question number | 0.40 |
| Semantic similarity | 0.25 |
| Secondary semantic evidence | 0.20 |
| Sequence/order evidence | 0.10 |
| OCR confidence | 0.05 |

The default acceptance threshold is `0.90`; scores from `0.65` to `0.90` require review. Both thresholds can be changed through environment variables. Exact-number matches receive a confidence boost, but still preserve the OCR and semantic evidence used to reach the result.

### Geometry guarantee

Highlight coordinates always originate from OCR provider geometry. The application normalizes provider coordinates to the `0..1` range and renders them as responsive SVG polygons over the original document. Grading and semantic scoring cannot generate or alter highlight positions.

## API surface

```text
GET   /api/health
POST  /api/session
POST  /api/session?demo=true
GET   /api/session/:id
POST  /api/session/:id/question-paper
POST  /api/session/:id/answer-sheet
POST  /api/session/:id/process
GET   /api/session/:id/progress
GET   /api/session/:id/results
GET   /api/session/:id/document/:type
PATCH /api/session/:id/mapping
```

Add `?debug=true` to the application URL and results endpoint to expose mapping confidence, mapping methods, and debug overlay styling.

## Environment configuration

Copy `.env.example` to `.env.local`. At least one OCR provider is required for real uploads; the audited demo works without provider credentials.

| Variable | Purpose |
| --- | --- |
| `MISTRAL_API_KEY` | Mistral OCR authentication |
| `MISTRAL_OCR_MODEL` | OCR model, defaults to `mistral-ocr-latest` |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Azure Document Intelligence endpoint |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` | Azure Document Intelligence key |
| `GOOGLE_CLOUD_VISION_API_KEY` | Google Vision OCR for image uploads |
| `OPENAI_API_KEY` | Enables optional grading after mapping |
| `OPENAI_GRADING_MODEL` | Grading model identifier |
| `VEDA_MAPPING_ACCEPT_THRESHOLD` | Automatic match threshold |
| `VEDA_MAPPING_VERIFY_THRESHOLD` | Teacher-review threshold |

Provider credentials are server-only. Never commit `.env.local` or production secrets.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`.

Run the complete verification suite before publishing:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm start
```

## Production deployment

The application produces a standalone Next.js server and includes a multi-stage Docker image.

```bash
docker build -t vedaai .
docker run --rm -p 3000:3000 --env-file .env.production vedaai
```

Use `GET /api/health` as the container health check. It reports service health and which providers are configured without exposing credentials.

### Runtime requirement

The browser submits both documents to the processing route in one multipart request and receives progress plus the completed typed result over the same SSE response. The review viewer uses browser-local object URLs for the original documents. This keeps the primary upload → OCR → results workflow safe on serverless platforms because it never expects a later request to reach the same process instance. The older session upload/results endpoints remain available for long-lived single-instance deployments and API compatibility.

Each file is validated independently up to 10 MB. A hosting platform may impose a smaller request-ingress limit on the combined multipart request; an HTTP 413 is converted into an actionable message in the UI. For guaranteed 10 MB + 10 MB uploads, deploy the included standalone container or place direct-to-object-storage uploads in front of the processing route.

The runtime must allow outbound HTTPS access to every configured OCR or grading provider. Reverse proxies should disable response buffering for the processing endpoint so SSE progress events reach the browser immediately.

## Failure behavior

- One provider may fail while the pipeline continues with successful providers; the failure is returned as a review warning.
- If every configured OCR provider fails, processing stops with an actionable error.
- Provider authentication, credit exhaustion, rate limits, oversized documents, and temporary outages are translated into actionable UI messages. Retryable 408/429/5xx responses use bounded backoff before failing.
- If no supported question numbering is detected, the pipeline stops rather than inventing question structure.
- Uncertain mappings remain explicitly reviewable and can be manually reassigned through the mapping endpoint.
- Grading failures do not discard successful OCR or mappings.

## Tests

The automated suite covers MIME signature validation, provider quota/error messaging, question-number normalization, hierarchical subquestion extraction, source-order preservation, Mistral markdown parsing, out-of-order answers, skipped questions, unmatched writing, multi-page continuation geometry, and multiple answers on one page. Production validation also includes ESLint, TypeScript checking, a standalone Next.js build, a health check, a full streamed demo integration test, and a live Mistral OCR smoke test.
