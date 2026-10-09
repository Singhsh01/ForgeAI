/** Truncates `str` to at most `max` characters, adding "…" when shortened. */
export function truncate(str, max) {
  if (str.length <= max) return str;
  if (max <= 1) return "…".slice(0, max);
  return str.slice(0, max - 1) + "…";
}

export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

/** Wraps text to lines of at most `width` characters, breaking at spaces. */
export function wordWrap(text, width) {
  const lines = [];
  let line = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
