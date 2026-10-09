import fs from "node:fs";
import path from "node:path";

/** Detects how to install dependencies and run tests/lint for a repository. */
export interface ProjectCommands {
  ecosystem: "node" | "python" | "go" | "rust" | "make" | "unknown";
  install?: string;
  test?: string;
  lint?: string;
  notes: string[];
}

export function detectProject(dir: string): ProjectCommands {
  const has = (f: string) => fs.existsSync(path.join(dir, f));
  const notes: string[] = [];
  if (has("package.json")) {
    let pkg: { scripts?: Record<string, string>; dependencies?: object; devDependencies?: object } = {};
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    } catch {
      notes.push("package.json could not be parsed");
    }
    const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const hasDeps = Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length > 0;
    const install = !hasDeps
      ? undefined
      : pm === "pnpm"
        ? "corepack pnpm install --frozen-lockfile"
        : pm === "yarn"
          ? "corepack yarn install --frozen-lockfile"
          : has("package-lock.json")
            ? "npm ci --no-audit --no-fund"
            : "npm install --no-audit --no-fund";
    const testScript = pkg.scripts?.test;
    const test = testScript && !/no test specified/.test(testScript) ? `${pm === "npm" ? "npm" : `corepack ${pm}`} test` : undefined;
    if (!test) notes.push("No test script found in package.json");
    const lint = pkg.scripts?.lint ? `${pm === "npm" ? "npm run" : `corepack ${pm}`} lint` : pkg.scripts?.typecheck ? `${pm === "npm" ? "npm run" : `corepack ${pm}`} typecheck` : undefined;
    return { ecosystem: "node", install, test, lint, notes };
  }
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) {
    const install = has("requirements.txt")
      ? "python3 -m pip install --user -q -r requirements.txt pytest"
      : "python3 -m pip install --user -q -e . pytest";
    return { ecosystem: "python", install, test: "python3 -m pytest -q", lint: undefined, notes };
  }
  if (has("go.mod")) return { ecosystem: "go", install: "go mod download", test: "go test ./...", lint: "go vet ./...", notes };
  if (has("Cargo.toml")) return { ecosystem: "rust", install: "cargo fetch", test: "cargo test --offline", lint: undefined, notes };
  if (has("Makefile") && /^test:/m.test(fs.readFileSync(path.join(dir, "Makefile"), "utf8"))) return { ecosystem: "make", test: "make test", notes };
  return { ecosystem: "unknown", notes: ["Could not detect a test runner"] };
}

/** Extracts pass/fail counts from common runners' output. Best effort; null when unknown. */
export function parseTestSummary(output: string): { passed?: number; failed?: number; total?: number } | null {
  const pick = (re: RegExp) => {
    const all = [...output.matchAll(re)];
    return all.length ? Number(all[all.length - 1][1]) : undefined;
  };
  // node:test (TAP)
  const nodePass = pick(/^# pass (\d+)/gm);
  const nodeFail = pick(/^# fail (\d+)/gm);
  if (nodePass !== undefined || nodeFail !== undefined) return { passed: nodePass ?? 0, failed: nodeFail ?? 0, total: (nodePass ?? 0) + (nodeFail ?? 0) };
  // node:test (spec reporter)
  const specPass = pick(/^ℹ pass (\d+)/gm);
  const specFail = pick(/^ℹ fail (\d+)/gm);
  if (specPass !== undefined || specFail !== undefined) return { passed: specPass ?? 0, failed: specFail ?? 0, total: (specPass ?? 0) + (specFail ?? 0) };
  // vitest
  const vitest = output.match(/Tests\s+(?:(\d+) failed\s*\|\s*)?(\d+) passed[^\n]*\((\d+)\)/);
  if (vitest) return { failed: Number(vitest[1] ?? 0), passed: Number(vitest[2]), total: Number(vitest[3]) };
  const vitestFailOnly = output.match(/Tests\s+(\d+) failed\s*\((\d+)\)/);
  if (vitestFailOnly) return { failed: Number(vitestFailOnly[1]), passed: 0, total: Number(vitestFailOnly[2]) };
  // jest
  const jest = output.match(/Tests:\s+(?:(\d+) failed, )?(?:\d+ skipped, )?(?:(\d+) passed, )?(\d+) total/);
  if (jest) return { failed: Number(jest[1] ?? 0), passed: Number(jest[2] ?? 0), total: Number(jest[3]) };
  // pytest
  const pyPassed = output.match(/(\d+) passed/);
  const pyFailed = output.match(/(\d+) failed/);
  if (/=+ .*(passed|failed).* in [\d.]+s/.test(output)) {
    const p = Number(pyPassed?.[1] ?? 0);
    const f = Number(pyFailed?.[1] ?? 0);
    return { passed: p, failed: f, total: p + f };
  }
  // go test
  const goOk = (output.match(/^ok\s/gm) ?? []).length;
  const goFail = (output.match(/^FAIL\s/gm) ?? []).length;
  if (goOk || goFail) return { passed: goOk, failed: goFail, total: goOk + goFail };
  return null;
}
