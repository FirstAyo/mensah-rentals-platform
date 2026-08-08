const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;

export async function waitForHttpReady({
  fetcher = fetch,
  intervalMs = 500,
  onAttempt,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  timeoutMs = 120_000,
  url,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    onAttempt?.();
    const controller = new AbortController();
    const requestTimer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetcher(url, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(requestTimer);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(intervalMs, remainingMs)),
      );
  }

  const detail = lastError instanceof Error ? ` (${lastError.message})` : '';
  throw new Error(
    `API readiness timed out after ${timeoutMs}ms while waiting for ${url}${detail}`,
  );
}
