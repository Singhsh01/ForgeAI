const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Calls `fn` until it resolves or `attempts` is exhausted, waiting `delayMs` between tries. */
export async function retry(fn, { attempts = 3, delayMs = 0 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastError = e;
      if (i < attempts - 1 && delayMs) await sleep(delayMs);
    }
  }
  throw lastError;
}
