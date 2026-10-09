// Shared helper for test-generation tasks: finds the agent's new test files, checks they pass
// on the real implementation, and checks they fail against each mutant.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function findTests(root, mention) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "hidden" && e.name !== "node_modules") walk(p);
      } else if (/\.test\.(m?js)$/.test(e.name) && fs.readFileSync(p, "utf8").includes(mention)) out.push(p);
    }
  };
  walk(path.join(root, "test"));
  return out;
}

export function runTests(cwd, files) {
  // Strip NODE_TEST_CONTEXT so the nested runner reports its own exit status.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const r = spawnSync(process.execPath, ["--test", ...files], { cwd, env, encoding: "utf8", timeout: 60_000 });
  return { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

export function withMutant(root, file, mutate, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mutant-"));
  try {
    fs.cpSync(root, tmp, { recursive: true, filter: (s) => !s.includes(`${path.sep}node_modules`) && !s.includes(`${path.sep}.git`) });
    const target = path.join(tmp, file);
    const src = fs.readFileSync(target, "utf8");
    const mutated = mutate(src);
    if (mutated === src) throw new Error(`mutation did not apply to ${file}`);
    fs.writeFileSync(target, mutated);
    return fn(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
