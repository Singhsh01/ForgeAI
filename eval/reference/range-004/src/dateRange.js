const DAY = 24 * 60 * 60 * 1000;

/**
 * Number of calendar days in the inclusive range [start, end] (ISO dates "YYYY-MM-DD").
 * e.g. daysBetween("2024-01-01", "2024-01-01") === 1
 */
export function daysBetween(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (b < a) return 0;
  return Math.round((b - a) / DAY) + 1;
}
