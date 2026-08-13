import { trace } from "@opentelemetry/api";
import { normaliseTelemetryAttributes } from "@nexo/telemetry/redaction";

export interface McpClient {
  callTool(name: string, args: unknown): Promise<unknown>;
}

export class InternalMcpClient implements McpClient {
  async callTool(name: string, args: unknown): Promise<unknown> {
    const tracer = trace.getTracer("nexo-api");
    return tracer.startActiveSpan(`mcp.${name}`, async (span) => {
      const started = performance.now();
      try {
        const endpoint = process.env.MCP_INTERNAL_URL;
        if (!endpoint) throw new Error("MCP_INTERNAL_URL is required");
        span.setAttributes(normaliseTelemetryAttributes({
          "mcp.tool.name": name,
          ...(typeof args === "object" && args !== null ? args as Record<string, unknown> : {})
        }));
        const response = await fetch(`${endpoint}/tools/${name}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args)
        });
        span.setAttribute("mcp.duration_ms", Math.round(performance.now() - started));
        if (!response.ok) throw new Error(`MCP tool ${name} failed: ${response.status}`);
        const result = await response.json() as unknown;
        span.setAttribute("mcp.result_count", resultCount(result));
        return result;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

function resultCount(result: unknown): number {
  if (typeof result !== "object" || result === null) return 0;
  const values = Object.values(result as Record<string, unknown>);
  const firstArray = values.find(Array.isArray);
  return firstArray ? firstArray.length : 0;
}
