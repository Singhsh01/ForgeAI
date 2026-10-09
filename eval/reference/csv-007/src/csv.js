/** Parses a single CSV line into fields. Supports double-quoted fields. */
export function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  while (i <= line.length) {
    while (line[i] === " " || line[i] === "\t") i++;
    let value = "";
    if (line[i] === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { value += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else value += line[i++];
      }
      while (i < line.length && line[i] !== ",") i++;
    } else {
      const end = line.indexOf(",", i);
      value = (end === -1 ? line.slice(i) : line.slice(i, end)).trim();
      i = end === -1 ? line.length : end;
    }
    fields.push(value);
    if (line[i] === ",") i++;
    else break;
  }
  return fields;
}
