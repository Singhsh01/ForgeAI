import pino from "pino";
import { redact } from "./redact";

/** Structured JSON logger. Every string field passes through secret redaction. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "forgeai" },
  redact: {
    paths: ["*.token", "*.password", "*.apiKey", "*.authorization", "headers.authorization", "req.headers.cookie"],
    censor: "[REDACTED]",
  },
  hooks: {
    logMethod(args, method) {
      method.apply(
        this,
        args.map((a) => (typeof a === "string" ? redact(a) : a)) as Parameters<typeof method>,
      );
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
