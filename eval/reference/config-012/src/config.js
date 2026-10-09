const TRUE = new Set(["true", "1", "yes"]);
const FALSE = new Set(["false", "0", "no"]);

function coerce(key, raw, def) {
  if (typeof def === "number") {
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n)) throw new Error(`Config ${key} must be a number, got "${raw}"`);
    return n;
  }
  if (typeof def === "boolean") {
    const v = String(raw).toLowerCase();
    if (TRUE.has(v)) return true;
    if (FALSE.has(v)) return false;
    throw new Error(`Config ${key} must be a boolean, got "${raw}"`);
  }
  return raw;
}

/**
 * Reads configuration from an env-like object using a schema of defaults; values are coerced
 * to the type of their default.
 */
export function readConfig(env, defaults) {
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    out[key] = key in env ? coerce(key, env[key], def) : def;
  }
  return out;
}
