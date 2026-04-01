export async function fetchWithSessionRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  retries = 1,
  delayMs = 250,
): Promise<Response> {
  const response = await fetch(input, {
    cache: init.cache ?? "no-store",
    credentials: init.credentials ?? "same-origin",
    ...init,
  });

  if (response.status !== 401 || retries <= 0) {
    return response;
  }

  await new Promise((resolve) => window.setTimeout(resolve, delayMs));

  return fetchWithSessionRetry(input, init, retries - 1, delayMs);
}
