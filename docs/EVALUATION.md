# Evaluation

## Suite

20 tasks in `eval/tasks/*.json` against the fixture repository `eval/fixtures/toolkit` (plain ESM, Node's built-in test runner, no dependencies):

| Category | Tasks |
|---|---|
| Bug fixing (8) | auth-001, money-002, slug-003, range-004, cart-005, rate-006, csv-007, page-008 |
| Feature (5) | cache-009, retry-010, events-011, config-012, strings-013 |
| Refactoring (3) | refactor-014, refactor-015, refactor-016 |
| Test generation (2) | testgen-017, testgen-018 (graded by mutation testing: the agent's tests must pass and must fail against 3–4 mutants) |
| Dependency change (2) | dep-019 (remove unused dependency), dep-020 (migrate off deprecated `url.parse`) |

Each task has explicit acceptance criteria, an allow-list of paths it may touch, a hidden test (`eval/hidden/`) the agent never sees, and a reference solution (`eval/reference/`).

## Ground truth checks (deterministic)

* Hidden tests run in the sandbox after the agent finishes.
* Unrelated modifications = changed files outside `allowedPaths`.
* Repair iterations, denied tool calls ("tool failures"), duration, tokens and SDK-estimated cost are read from the run record.

No LLM-as-judge is used for any score. (A rubric-based judge for maintainability/explanation quality is a planned addition and will be reported separately from hard metrics.)

## Commands

```bash
npm run eval:validate          # validates the suite itself; no model calls
npm run eval                   # runs the real agents on all tasks (needs NVIDIA_API_KEY or GEMINI_API_KEY + sandbox)
npm run eval -- auth-001 csv-007
```

Reports are written to `eval/reports/*.json` and shown on the Evaluations screen.

## Results so far

* **Suite validation (executed):** 20/20 tasks valid — every hidden test fails on the untouched fixture and passes with the reference solution; references keep the fixture suite green and touch only allowed paths. 58 hidden test cases in total.
* **Agent benchmark: not yet executed.** The environment ForgeAI was built in had no model API key and no network route to NVIDIA or Google. No agent results are reported until `npm run eval` has been run.
