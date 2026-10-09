import { describe, expect, it } from "vitest";
import { canTransition, assertTransition, TRANSITIONS } from "@/server/workflow/states";
import { RUN_STATUSES } from "@/lib/types";

describe("run state machine", () => {
  it("defines transitions for every status", () => {
    for (const s of RUN_STATUSES) expect(TRANSITIONS[s]).toBeDefined();
  });
  it("cannot publish without approval", () => {
    expect(canTransition("reviewing", "publishing")).toBe(false);
    expect(canTransition("awaiting_publish_approval", "publishing")).toBe(true);
  });
  it("cannot skip verification", () => {
    expect(canTransition("coding", "reviewing")).toBe(false);
  });
  it("terminal states are final", () => {
    for (const s of ["completed", "failed", "cancelled"] as const) expect(TRANSITIONS[s]).toEqual([]);
  });
  it("throws on illegal transitions", () => {
    expect(() => assertTransition("queued", "completed")).toThrow(/Illegal/);
  });
});
