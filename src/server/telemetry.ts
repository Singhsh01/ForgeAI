import { trace, type Span, SpanStatusCode, context } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

let started = false;

/**
 * Registers a tracer provider so every run gets a real W3C trace id. Spans are exported
 * to an OTLP/HTTP collector only when OTEL_EXPORTER_OTLP_ENDPOINT is configured.
 */
export function initTelemetry() {
  if (started) return;
  started = true;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": "forgeai" }),
    spanProcessors: endpoint ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint }))] : [],
  });
  provider.register();
}

export const tracer = () => {
  initTelemetry();
  return trace.getTracer("forgeai", "0.1.0");
};

export async function withSpan<T>(name: string, attrs: Record<string, string | number | boolean>, fn: (span: Span) => Promise<T>, parent?: Span): Promise<T> {
  const ctx = parent ? trace.setSpan(context.active(), parent) : context.active();
  return tracer().startActiveSpan(name, { attributes: attrs }, ctx, async (span) => {
    try {
      const out = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}
