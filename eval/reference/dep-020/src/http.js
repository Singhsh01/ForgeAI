/** Returns { protocol, host, port } for an absolute URL string. Port is a number or null. */
export function parseHost(input) {
  const u = new URL(input); // throws TypeError on invalid input
  const host = u.hostname.startsWith("[") && u.hostname.endsWith("]") ? u.hostname.slice(1, -1) : u.hostname;
  return { protocol: u.protocol, host, port: u.port ? Number(u.port) : null };
}
