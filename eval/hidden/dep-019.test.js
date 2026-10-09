import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
test("left-pad removed", () => {
  assert.equal(pkg.dependencies?.["left-pad"], undefined);
  assert.equal(pkg.devDependencies?.["left-pad"], undefined);
});
test("no dependency added", () => {
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), []);
  assert.equal(pkg.scripts.test, "node --test");
});
