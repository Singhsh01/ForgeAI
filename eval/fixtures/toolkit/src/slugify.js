/** Converts a title into a URL slug. */
export function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-");
}
