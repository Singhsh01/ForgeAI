import { z } from "zod";

export const PlanSchema = z.object({
  summary: z.string().min(1).max(600),
  understanding: z.string().max(2000),
  relevantFiles: z.array(z.object({ path: z.string(), reason: z.string() })).max(30),
  steps: z.array(z.object({ title: z.string(), detail: z.string(), files: z.array(z.string()) })).min(1).max(20),
  risks: z.array(z.object({ description: z.string(), severity: z.enum(["low", "medium", "high"]) })).max(15),
  uncertainty: z.enum(["low", "medium", "high"]),
  successCriteria: z.array(z.string()).min(1).max(15),
  testStrategy: z.string().max(1500),
});

export const CoderReportSchema = z.object({
  summary: z.string().max(1500),
  filesChanged: z.array(z.string()).max(100),
  testsAddedOrUpdated: z.array(z.string()).max(50),
  followUps: z.array(z.string()).max(10),
});

export const VerificationFeedbackSchema = z.object({
  rootCause: z.string().max(2000),
  failingTests: z.array(z.string()).max(50),
  suggestedFix: z.string().max(3000),
  isEnvironmentalFailure: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
});

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "request_changes", "comment"]),
  summary: z.string().max(2000),
  requirementsMet: z.array(z.object({ requirement: z.string(), met: z.boolean(), evidence: z.string() })).max(20),
  comments: z
    .array(
      z.object({
        file: z.string(),
        line: z.number().int().optional(),
        severity: z.enum(["info", "warning", "critical"]),
        category: z.string(),
        body: z.string(),
        basis: z.enum(["verified", "assumption"]),
      }),
    )
    .max(40),
  securityConcerns: z.array(z.string()).max(20),
  regressionRisks: z.array(z.string()).max(20),
  commitMessage: z.string().min(1).max(500),
  prTitle: z.string().min(1).max(120),
});

export type PlanOut = z.infer<typeof PlanSchema>;
export type ReviewOut = z.infer<typeof ReviewSchema>;
export type VerificationFeedback = z.infer<typeof VerificationFeedbackSchema>;
export type CoderReport = z.infer<typeof CoderReportSchema>;

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** Parses structured output, falling back to the last JSON object in free text. */
export function parseStructured<T>(schema: z.ZodType<T>, structured: unknown, text: string): T {
  if (structured != null) {
    const r = schema.safeParse(structured);
    if (r.success) return r.data;
  }
  const candidates = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const lastBrace = text.lastIndexOf("{");
  const firstBrace = text.indexOf("{");
  if (firstBrace !== -1) candidates.push(text.slice(firstBrace, text.lastIndexOf("}") + 1));
  if (lastBrace !== -1) candidates.push(text.slice(lastBrace, text.lastIndexOf("}") + 1));
  for (const c of candidates.reverse()) {
    try {
      const r = schema.safeParse(JSON.parse(c));
      if (r.success) return r.data;
    } catch {
      /* try next */
    }
  }
  throw new Error("Agent did not return output matching the required schema");
}
