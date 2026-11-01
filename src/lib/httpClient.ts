/**
 * Shared HTTP client utilities for JSON API endpoints.
 */

export async function requestJson<T>(
  url: string,
  options: RequestInit,
  fallbackErrorMessage: string
): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const message =
      errorPayload && typeof errorPayload.error === 'string' && errorPayload.error
        ? errorPayload.error
        : fallbackErrorMessage;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  fallbackErrorMessage: string
): Promise<T> {
  return requestJson<T>(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    fallbackErrorMessage
  );
}

