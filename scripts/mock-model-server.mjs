// TEST DOUBLE — not a real model. A tiny OpenAI-compatible server that answers like an agent
// for the "expired sessions" demo task only, so you can watch a full ForgeAI run (plan → edit →
// Docker tests → review → approval) without an API key. Results it produces are scripted.
//
//   node scripts/mock-model-server.mjs
//   FORGEAI_LLM_PROVIDER=openai-compatible FORGEAI_LLM_BASE_URL=http://127.0.0.1:4010/v1 \
//   FORGEAI_LLM_API_KEY=mock FORGEAI_MODEL=mock-model FORGEAI_DATA_DIR=.forgeai/mock npm run dev
import http from "node:http";
const tc = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const say = (message) => ({ choices: [{ message: { role: "assistant", ...message } }], usage: { prompt_tokens: 1500, completion_tokens: 200 } });
http.createServer((req, res) => {
  let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => {
    const b = JSON.parse(d); const sys = b.messages[0].content; const tools = b.messages.filter((m) => m.role === "tool").length;
    let out;
    if (sys.includes("Planning Agent")) out = tools === 0 ? say({ content: null, tool_calls: [tc("p1", "read_file", { path: "src/auth/session.js" })] }) : say({ content: JSON.stringify({ summary: "Make isSessionValid reject sessions whose expiresAt is not in the future.", understanding: "Only the token is checked.", relevantFiles: [{ path: "src/auth/session.js", reason: "isSessionValid" }], steps: [{ title: "Check expiry", detail: "Compare expiresAt with now", files: ["src/auth/session.js"] }, { title: "Regression test", detail: "Add test/expiry.test.js", files: ["test/expiry.test.js"] }], risks: [{ description: "touchSession relies on isSessionValid", severity: "low" }], uncertainty: "low", successCriteria: ["Expired sessions are invalid"], testStrategy: "node:test regression test" }) });
    else if (sys.includes("Coding Agent")) out = tools === 0 ? say({ content: null, tool_calls: [tc("c1", "edit_file", { path: "src/auth/session.js", old_string: "  return Boolean(session && session.token);", new_string: "  if (!session || !session.token) return false;\n  return typeof session.expiresAt === \"number\" && session.expiresAt > now;" }), tc("c2", "write_file", { path: "test/expiry.test.js", content: "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { createSession, isSessionValid } from \"../src/auth/session.js\";\n\ntest(\"expired sessions are invalid\", () => {\n  const s = createSession(\"u\", { now: 0, ttlMs: 10 });\n  assert.equal(isSessionValid(s, 10), false);\n});\n" })] }) : say({ content: JSON.stringify({ summary: "Added expiry check and regression test.", filesChanged: ["src/auth/session.js", "test/expiry.test.js"], testsAddedOrUpdated: ["test/expiry.test.js"], followUps: [] }) });
    else out = say({ content: JSON.stringify({ verdict: "approve", summary: "Minimal fix with a regression test.", requirementsMet: [{ requirement: "Expired sessions are invalid", met: true, evidence: "attempt 1 tests pass" }], comments: [], securityConcerns: [], regressionRisks: [], commitMessage: "fix(auth): reject expired sessions", prTitle: "Reject expired sessions" }) });
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(out));
  });
}).listen(4010, "127.0.0.1", () => console.log("mock model on 4010"));
