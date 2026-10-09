/** Parses a single CSV line into fields. Supports double-quoted fields. */
export function parseCsvLine(line) {
  return line.split(",").map((f) => f.trim().replace(/^"|"$/g, ""));
}
