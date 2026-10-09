/** Formats an integer amount of cents as a currency string, e.g. 1234 -> "$12.34". */
export function formatCents(cents, symbol = "$") {
  const dollars = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${symbol}${dollars}.${rest}`;
}

/** Adds amounts expressed in cents. */
export function addCents(...amounts) {
  return amounts.reduce((a, b) => a + b, 0);
}
