import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findTests, runTests, withMutant } from "./_mutation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MUTANTS = [
  ["whitespace", (s) => s.replace("if (/\\s/.test(value)) return false;", "")],
  ["multiple-at", (s) => s.replace("parts.length !== 2", "parts.length < 2")],
  ["empty-label", (s) => s.replace(" && labels.every((l) => l.length > 0)", "")],
  ["non-string", (s) => s.replace('if (typeof value !== "string") return false;', 'value = String(value);')],
];

test("agent wrote isEmail tests that pass", () => {
  const files = findTests(root, "isEmail");
  assert.ok(files.length > 0, "no test file mentioning isEmail was added");
  const r = runTests(root, files);
  assert.ok(r.ok, r.out.slice(-2000));
});
for (const [name, mutate] of MUTANTS) {
  test(`tests kill mutant: ${name}`, () => {
    withMutant(root, "src/validators.js", mutate, (dir) => {
      assert.equal(runTests(dir, findTests(dir, "isEmail")).ok, false, `tests did not detect the ${name} mutant`);
    });
  });
}
