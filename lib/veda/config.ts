export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

export const MAPPING_WEIGHTS = {
  number: 0.4,
  semantic: 0.25,
  llm: 0.2,
  sequence: 0.1,
  ocr: 0.05,
} as const;

export const CONFIDENCE_THRESHOLDS = {
  accept: Number(process.env.VEDA_MAPPING_ACCEPT_THRESHOLD ?? 0.9),
  verify: Number(process.env.VEDA_MAPPING_VERIFY_THRESHOLD ?? 0.65),
} as const;

