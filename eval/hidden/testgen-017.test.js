import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findTests, runTests, withMutant } from "./_mutation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MUTANTS = [
  ["boundary", (s) => s.replace("str.length <= max", "str.length < max")],
  ["overflow", (s) => s.replace("str.slice(0, max - 1)", "str.slice(0, max)")],
  ["tiny-max", (s) => s.replace('"…".slice(0, max)', '"…"')],
];

test("agent wrote truncate tests that pass", () => {
  const files = findTests(root, "truncate");
  assert.ok(files.length > 0, "no test file mentioning truncate was added");
  const r = runTests(root, files);
  assert.ok(r.ok, r.out.slice(-2000));
});
for (const [name, mutate] of MUTANTS) {
  test(`tests kill mutant: ${name}`, () => {
    withMutant(root, "src/strings.js", mutate, (dir) => {
      const files = findTests(dir, "truncate");
      assert.equal(runTests(dir, files).ok, false, `tests did not detect the ${name} mutant`);
    });
  });
}
