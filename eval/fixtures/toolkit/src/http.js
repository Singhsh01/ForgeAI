import url from "node:url";

/** Returns { protocol, host, port } for an absolute URL string. Port is a number or null. */
export function parseHost(input) {
  const u = url.parse(input);
  return { protocol: u.protocol, host: u.hostname, port: u.port ? Number(u.port) : null };
}
