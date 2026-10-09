/** Restricts n to the inclusive range [min, max]. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
