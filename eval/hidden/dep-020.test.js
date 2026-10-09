import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseHost } from "../../src/http.js";

test("no url.parse", () => {
  const s = fs.readFileSync(new URL("../../src/http.js", import.meta.url), "utf8");
  assert.doesNotMatch(s, /url\.parse\s*\(/);
});
test("parses hosts", () => {
  assert.deepEqual(parseHost("https://example.com/a?b"), { protocol: "https:", host: "example.com", port: null });
  assert.deepEqual(parseHost("http://localhost:8080"), { protocol: "http:", host: "localhost", port: 8080 });
  assert.deepEqual(parseHost("http://[::1]:3000/x"), { protocol: "http:", host: "::1", port: 3000 });
});
test("invalid throws TypeError", () => {
  assert.throws(() => parseHost("not a url"), TypeError);
});
