/** Basic e-mail validation: one "@", non-empty local part, domain with a dot, no spaces. */
export function isEmail(value) {
  if (typeof value !== "string") return false;
  if (/\s/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || !domain) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((l) => l.length > 0);
}
