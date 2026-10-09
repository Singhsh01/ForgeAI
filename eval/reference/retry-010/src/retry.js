const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls `fn` until it resolves or `attempts` is exhausted. The wait starts at `delayMs` and
 * is multiplied by `factor` after each failure; `onRetry(error, attempt)` runs before each retry.
 */
export async function retry(fn, { attempts = 3, delayMs = 0, factor = 1, onRetry } = {}) {
  let lastError;
  let delay = delayMs;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        onRetry?.(e, i);
        if (delay) await sleep(delay);
        delay *= factor;
      }
    }
  }
  throw lastError;
}
