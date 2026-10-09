import { describe, expect, it } from "vitest";
import { redact, redactDeep, registerSecret } from "@/server/redact";

describe("secret redaction", () => {
  it("scrubs common token formats", () => {
    const s = "key sk-ant-api03-abcdefghijklmnop and ghp_abcdefghijklmnopqrstuvwxyz0123 and github_pat_11ABCDEFG0123456789_abcdef";
    const r = redact(s);
    expect(r).not.toMatch(/sk-ant-api03/);
    expect(r).not.toMatch(/ghp_abc/);
    expect(r).not.toMatch(/github_pat_11/);
  });
  it("scrubs NVIDIA and Google keys", () => {
    const r = redact("nvapi-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 and AIzaSyA1234567890abcdefghijklmnopqrstu");
    expect(r).toBe("[REDACTED] and [REDACTED]");
  });
  it("scrubs authorization headers but keeps the prefix", () => {
    expect(redact("Authorization: Bearer abc.def.ghi")).toBe("Authorization: Bearer [REDACTED]");
  });
  it("scrubs registered runtime secrets verbatim", () => {
    registerSecret("my-very-private-value");
    expect(redact("x my-very-private-value y")).toBe("x [REDACTED] y");
  });
  it("redacts sensitive keys in objects", () => {
    expect(redactDeep({ token: "abc", nested: { password: "p", ok: "fine" } })).toEqual({ token: "[REDACTED]", nested: { password: "[REDACTED]", ok: "fine" } });
  });
});
