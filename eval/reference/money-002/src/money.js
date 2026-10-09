/** Formats an integer amount of cents as a currency string, e.g. 1234 -> "$12.34". */
export function formatCents(cents, symbol = "$") {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}${symbol}${dollars}.${rest}`;
}

/** Adds amounts expressed in cents. */
export function addCents(...amounts) {
  return amounts.reduce((a, b) => a + b, 0);
}
