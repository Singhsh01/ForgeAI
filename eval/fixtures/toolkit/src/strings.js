/** Truncates `str` to at most `max` characters, adding "…" when shortened. */
export function truncate(str, max) {
  if (str.length <= max) return str;
  if (max <= 1) return "…".slice(0, max);
  return str.slice(0, max - 1) + "…";
}

export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}
