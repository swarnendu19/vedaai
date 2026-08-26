import { bytesToArrayBuffer, bytesToDataUrl, normalizePolygon, polygonIoU } from './documents';
import type { OCRLine, OCRPage, OCRWord, ProviderName, UploadedDocument } from './types';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function textConfidence(value: unknown, fallback = 0.75) {
  const confidence = asNumber(value, fallback);
  return confidence > 1 ? confidence / 100 : confidence;
}

function wordsForLine(
  provider: ProviderName,
  page: number,
  lineId: string,
  text: string,
  polygon: OCRLine['polygon'],
  confidence: number,
): OCRWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.map((token, index) => ({
    id: `${lineId}-w${index + 1}`,
    text: token,
    normalizedText: token.toLocaleLowerCase(),
    confidence,
    page,
    polygon,
    provider,
    lineId,
  }));
}

function mistralBlockPolygon(block: JsonRecord, width: number, height: number) {
  const bbox = block.bbox;
  if (Array.isArray(bbox)) return normalizePolygon(bbox.map(Number), width, height);
  const box = asRecord(bbox);
  const x0 = asNumber(block.top_left_x ?? box.x_min ?? box.x0 ?? box.left);
  const y0 = asNumber(block.top_left_y ?? box.y_min ?? box.y0 ?? box.top);
  const x1 = asNumber(block.bottom_right_x ?? box.x_max ?? box.x1 ?? box.right);
  const y1 = asNumber(block.bottom_right_y ?? box.y_max ?? box.y1 ?? box.bottom);
  return normalizePolygon([x0, y0, x1, y0, x1, y1, x0, y1], width, height);
}

function mistralBlockConfidence(block: JsonRecord) {
  const scores = asRecord(block.confidence_scores);
  return textConfidence(
    scores.average_content_confidence_score ??
      scores.minimum_content_confidence_score ??
      block.confidence,
    0.82,
  );
}

function cleanMarkdownLine(line: string) {
  return line
    .replace(/^\s*(?:#{1,6}|>|[-*+]\s+)\s*/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function likelyNumberedLine(text: string) {
  return /^\s*(?:(?:q(?:uestion)?|ans(?:wer)?)\.?\s*)?(?:\d{1,3}|\([a-z]\)|\((?:i{1,3}|iv|v|vi{0,3}|ix|x)\))\s*[.):-]?/i.test(text);
}

function comparableText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function overlapScore(left: string, right: string) {
  const a = new Set(comparableText(left).split(' ').filter(Boolean));
  const b = new Set(comparableText(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

export async function runMistralOCR(document: UploadedDocument): Promise<OCRPage[]> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY is not configured.');
  const response = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_OCR_MODEL ?? 'mistral-ocr-latest',
      document: { type: 'document_url', document_url: bytesToDataUrl(document) },
      include_blocks: true,
      confidence_scores_granularity: 'block',
      extract_header: false,
      extract_footer: false,
    }),
  });
  if (!response.ok) throw new Error(`Mistral OCR failed (${response.status}).`);
  const payload = asRecord(await response.json());
  return asArray(payload.pages).map((pageValue, pageIndex) => {
    const page = asRecord(pageValue);
    const dimensions = asRecord(page.dimensions);
    const width = asNumber(dimensions.width, 1);
    const height = asNumber(dimensions.height, 1);
    const rawBlocks = asArray(page.blocks);
    const markdownLines = asString(page.markdown)
      .split(/\r?\n/)
      .map(cleanMarkdownLine)
      .filter((line) => line && !/^!\[.*\]\(.+\)$/.test(line));
    const blockLines: OCRLine[] = rawBlocks.flatMap((blockValue, blockIndex) => {
      const block = asRecord(blockValue);
      const content = asString(block.content ?? block.text ?? block.markdown).trim();
      const confidence = mistralBlockConfidence(block);
      const polygon = mistralBlockPolygon(block, width, height);
      return content.split(/\r?\n/).map(cleanMarkdownLine).filter(Boolean).map((text, lineIndex) => {
        const id = `mistral-p${pageIndex + 1}-b${blockIndex + 1}-l${lineIndex + 1}`;
        return {
          id,
          page: pageIndex + 1,
          text,
          words: wordsForLine('mistral', pageIndex + 1, id, text, polygon, confidence),
          polygon,
          confidence,
          provider: 'mistral' as const,
        };
      });
    });
    const markdownOCRLines: OCRLine[] = markdownLines.map((text, lineIndex) => {
      const bestBlock = blockLines
        .map((line) => ({ line, score: overlapScore(text, line.text) }))
        .sort((a, b) => b.score - a.score)[0];
      const source = bestBlock?.score >= 0.45 ? bestBlock.line : undefined;
      const id = `mistral-p${pageIndex + 1}-md${lineIndex + 1}`;
      const polygon = source?.polygon ?? [];
      const confidence = source?.confidence ?? 0.65;
      return {
        id,
        page: pageIndex + 1,
        text,
        words: wordsForLine('mistral', pageIndex + 1, id, text, polygon, confidence),
        polygon,
        confidence,
        provider: 'mistral' as const,
      };
    });
    const blockAnchorCount = blockLines.filter((line) => likelyNumberedLine(line.text)).length;
    const markdownAnchorCount = markdownOCRLines.filter((line) => likelyNumberedLine(line.text)).length;
    const lines = markdownAnchorCount > blockAnchorCount || !blockLines.length ? markdownOCRLines : blockLines;
    return { page: pageIndex + 1, width, height, lines, provider: 'mistral' };
  });
}

export async function runAzureOCR(document: UploadedDocument): Promise<OCRPage[]> {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.replace(/\/$/, '');
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  if (!endpoint || !apiKey) throw new Error('Azure Document Intelligence is not configured.');
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?_overload=analyzeDocument&api-version=2024-11-30&features=ocr.highResolution`;
  const analyze = await fetch(analyzeUrl, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': document.mimeType },
    body: bytesToArrayBuffer(document.bytes),
  });
  if (!analyze.ok) throw new Error(`Azure OCR submission failed (${analyze.status}).`);
  const operationUrl = analyze.headers.get('operation-location');
  if (!operationUrl) throw new Error('Azure OCR did not return an operation URL.');

  let result: JsonRecord = {};
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1000));
    const poll = await fetch(operationUrl, { headers: { 'Ocp-Apim-Subscription-Key': apiKey } });
    if (!poll.ok) throw new Error(`Azure OCR polling failed (${poll.status}).`);
    result = asRecord(await poll.json());
    const status = asString(result.status).toLowerCase();
    if (status === 'succeeded') break;
    if (status === 'failed' || status === 'canceled') throw new Error(`Azure OCR ${status}.`);
  }
  if (asString(result.status).toLowerCase() !== 'succeeded') throw new Error('Azure OCR timed out.');
  const analyzeResult = asRecord(result.analyzeResult);
  return asArray(analyzeResult.pages).map((pageValue, pageIndex) => {
    const page = asRecord(pageValue);
    const width = asNumber(page.width, 1);
    const height = asNumber(page.height, 1);
    const pageNumber = asNumber(page.pageNumber, pageIndex + 1);
    const lines: OCRLine[] = asArray(page.lines).map((lineValue, lineIndex) => {
      const line = asRecord(lineValue);
      const text = asString(line.content);
      const id = `azure-p${pageNumber}-l${lineIndex + 1}`;
      const polygon = normalizePolygon(asArray(line.polygon).map(Number), width, height);
      const confidence = textConfidence(line.confidence, 0.9);
      return {
        id,
        page: pageNumber,
        text,
        words: wordsForLine('azure', pageNumber, id, text, polygon, confidence),
        polygon,
        confidence,
        provider: 'azure' as const,
      };
    }).filter((line) => line.text.trim());
    return { page: pageNumber, width, height, lines, provider: 'azure' };
  });
}

function googleVertices(value: unknown, width: number, height: number) {
  const box = asRecord(value);
  const vertices = asArray(box.normalizedVertices).length
    ? asArray(box.normalizedVertices).flatMap((vertex) => {
        const point = asRecord(vertex);
        return [asNumber(point.x) * width, asNumber(point.y) * height];
      })
    : asArray(box.vertices).flatMap((vertex) => {
        const point = asRecord(vertex);
        return [asNumber(point.x), asNumber(point.y)];
      });
  return normalizePolygon(vertices, width, height);
}

export async function runGoogleOCR(document: UploadedDocument): Promise<OCRPage[]> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY is not configured.');
  if (document.mimeType === 'application/pdf') {
    throw new Error('Google synchronous OCR requires an image; PDF OCR continues with other providers.');
  }
  const dataUrl = bytesToDataUrl(document);
  const content = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['en'] },
      }],
    }),
  });
  if (!response.ok) throw new Error(`Google Vision OCR failed (${response.status}).`);
  const payload = asRecord(await response.json());
  const annotation = asRecord(asRecord(asArray(payload.responses)[0]).fullTextAnnotation);
  const pages = asArray(annotation.pages);
  return pages.map((pageValue, pageIndex) => {
    const page = asRecord(pageValue);
    const width = asNumber(page.width, 1);
    const height = asNumber(page.height, 1);
    const lines: OCRLine[] = [];
    for (const blockValue of asArray(page.blocks)) {
      const block = asRecord(blockValue);
      for (const paragraphValue of asArray(block.paragraphs)) {
        const paragraph = asRecord(paragraphValue);
        const words = asArray(paragraph.words);
        const text = words.map((wordValue) =>
          asArray(asRecord(wordValue).symbols).map((symbol) => asString(asRecord(symbol).text)).join(''),
        ).join(' ').trim();
        if (!text) continue;
        const confidence = textConfidence(paragraph.confidence, 0.82);
        const id = `google-p${pageIndex + 1}-l${lines.length + 1}`;
        const polygon = googleVertices(paragraph.boundingBox, width, height);
        lines.push({
          id,
          page: pageIndex + 1,
          text,
          words: wordsForLine('google', pageIndex + 1, id, text, polygon, confidence),
          polygon,
          confidence,
          provider: 'google',
        });
      }
    }
    return { page: pageIndex + 1, width, height, lines, provider: 'google' };
  });
}

function normalizedText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function buildOCRConsensus(providerPages: OCRPage[][]) {
  if (!providerPages.length) return [];
  const preferred = providerPages
    .slice()
    .sort((a, b) => b.flatMap((page) => page.lines).filter((line) => line.polygon.length).length - a.flatMap((page) => page.lines).filter((line) => line.polygon.length).length)[0];
  return preferred.map((page) => ({
    ...page,
    lines: page.lines.map((line) => {
      const peers = providerPages.flatMap((pages) => pages)
        .filter((candidatePage) => candidatePage.page === page.page)
        .flatMap((candidatePage) => candidatePage.lines)
        .filter((candidate) => candidate.id !== line.id && polygonIoU(candidate.polygon, line.polygon) > 0.25);
      if (!peers.length) return line;
      const agreeing = peers.filter((peer) => normalizedText(peer.text) === normalizedText(line.text));
      const confidence = agreeing.length
        ? Math.min(0.995, (line.confidence + agreeing.reduce((sum, peer) => sum + peer.confidence, 0)) / (agreeing.length + 1) + 0.04)
        : Math.max(0.45, line.confidence - 0.12);
      return { ...line, confidence };
    }),
  }));
}

export function configuredProviderNames() {
  return {
    mistral: Boolean(process.env.MISTRAL_API_KEY),
    azure: Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY),
    google: Boolean(process.env.GOOGLE_CLOUD_VISION_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
}
