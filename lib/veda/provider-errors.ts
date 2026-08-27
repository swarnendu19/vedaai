const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function providerFailureMessage(provider: string, status: number) {
  if (status === 401 || status === 403) return `${provider} credentials were rejected. Ask an administrator to verify the production API key.`;
  if (status === 402) return `${provider} has no remaining credits. Add credits or switch the configured provider, then try again.`;
  if (status === 413) return `${provider} rejected the document because it is too large. Upload a smaller or compressed file.`;
  if (status === 429) return `${provider} usage limit or rate limit has been reached. Please wait and try again, or ask an administrator to increase the provider quota.`;
  if (status >= 500) return `${provider} is temporarily unavailable (${status}). Please try again shortly.`;
  return `${provider} could not process the document (${status}).`;
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 5_000);
  return Math.min(750 * (2 ** attempt), 3_000);
}

export async function fetchProvider(
  input: string,
  init: RequestInit,
  attempts = 3,
) {
  const maxAttempts = Math.max(1, attempts);
  let response: Response;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await fetch(input, init);
    response = current;
    if (current.ok || !RETRYABLE_STATUS.has(current.status) || attempt === maxAttempts - 1) return current;
    const delay = retryDelay(current, attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return response!;
}
