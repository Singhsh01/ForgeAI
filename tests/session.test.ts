import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "@/lib/session";

const secret = "x".repeat(40);
describe("session tokens", () => {
  it("round-trips", async () => {
    const t = await signSession({ uid: "u", email: "a@b.c", exp: Date.now() / 1000 + 60 }, secret);
    expect((await verifySession(t, secret))?.uid).toBe("u");
  });
  it("rejects tampering, wrong secret and expiry", async () => {
    const t = await signSession({ uid: "u", email: "a@b.c", exp: Date.now() / 1000 + 60 }, secret);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", email: "a@b.c", exp: 9e9 })).toString("base64url");
    expect(await verifySession(`${forged}.${sig}`, secret)).toBeNull();
    expect(await verifySession(`${body}.${sig}`, "y".repeat(40))).toBeNull();
    const old = await signSession({ uid: "u", email: "a@b.c", exp: Date.now() / 1000 - 1 }, secret);
    expect(await verifySession(old, secret)).toBeNull();
    expect(await verifySession(undefined, secret)).toBeNull();
  });
});
