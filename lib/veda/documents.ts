import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from './config';
import type { Polygon, UploadedDocument } from './types';

function countPdfPages(bytes: Uint8Array) {
  const source = new TextDecoder('latin1').decode(bytes);
  const matches = source.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length ?? 1);
}

export function matchesMimeSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'application/pdf') return bytes.length >= 5 && new TextDecoder('latin1').decode(bytes.subarray(0, 5)) === '%PDF-';
  if (mimeType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return false;
}

export async function uploadedDocumentFromFile(file: File): Promise<UploadedDocument> {
  const mimeType = file.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Only PDF, JPG, and PNG files are supported.');
  }
  if (!file.size || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Files must be between 1 byte and 10 MB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesMimeSignature(bytes, mimeType)) throw new Error('The file contents do not match the selected PDF, JPG, or PNG format.');
  return {
    name: file.name.replace(/[\\/]/g, '_'),
    mimeType,
    size: file.size,
    pageCount: mimeType === 'application/pdf' ? countPdfPages(bytes) : 1,
    bytes,
  };
}

export function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function normalizePolygon(
  values: number[] | undefined,
  width: number,
  height: number,
): Polygon {
  if (!values || values.length < 4 || width <= 0 || height <= 0) return [];
  const polygon: Polygon = [];
  for (let index = 0; index < values.length - 1; index += 2) {
    polygon.push({ x: clamp(values[index] / width), y: clamp(values[index + 1] / height) });
  }
  return polygon;
}

export function polygonBounds(polygon: Polygon) {
  if (!polygon.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

export function polygonIoU(a: Polygon, b: Polygon) {
  const leftA = polygonBounds(a);
  const leftB = polygonBounds(b);
  const left = Math.max(leftA.left, leftB.left);
  const top = Math.max(leftA.top, leftB.top);
  const right = Math.min(leftA.right, leftB.right);
  const bottom = Math.min(leftA.bottom, leftB.bottom);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const areaA = Math.max(0, leftA.right - leftA.left) * Math.max(0, leftA.bottom - leftA.top);
  const areaB = Math.max(0, leftB.right - leftB.left) * Math.max(0, leftB.bottom - leftB.top);
  const union = areaA + areaB - intersection;
  return union ? intersection / union : 0;
}

export function bytesToDataUrl(document: UploadedDocument) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < document.bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...document.bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${document.mimeType};base64,${btoa(binary)}`;
}

export function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
