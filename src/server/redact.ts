/**
 * Secret redaction applied to anything we persist or stream (events, tool inputs,
 * sandbox output). Defence in depth: secrets should never reach these paths at all.
 */
const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_\-]{10,}/g, // Anthropic keys
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /nvapi-[A-Za-z0-9_\-]{20,}/g, // NVIDIA API keys
  /AIza[0-9A-Za-z_\-]{30,}/g, // Google API keys
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /xox[abpors]-[A-Za-z0-9-]{10,}/g, // Slack
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(authorization:\s*(?:bearer|basic|token)\s+)[A-Za-z0-9._~+/=\-]+/gi,
  /(x-access-token:)[^@\s]+/gi,
];

const extraSecrets = new Set<string>();

/** Register runtime secret values (e.g. tokens from env) so they're scrubbed verbatim. */
export function registerSecret(value: string | undefined | null) {
  if (value && value.length >= 8) extraSecrets.add(value);
}

export function redact(input: string): string {
  let out = input;
  for (const s of extraSecrets) out = out.split(s).join("[REDACTED]");
  for (const re of PATTERNS) {
    out = out.replace(re, (m, prefix) => (typeof prefix === "string" && prefix && m.startsWith(prefix) ? `${prefix}[REDACTED]` : "[REDACTED]"));
  }
  return out;
}

export function redactDeep<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /token|secret|password|api[_-]?key|authorization/i.test(k) ? "[REDACTED]" : redactDeep(v);
    }
    return out as T;
  }
  return value;
}
