/**
 * Reads configuration from an env-like object using a schema of defaults.
 * readConfig({ PORT: "8080" }, { PORT: 3000, DEBUG: false }) -> { PORT: "8080", DEBUG: false }
 */
export function readConfig(env, defaults) {
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    out[key] = key in env ? env[key] : def;
  }
  return out;
}
