import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | undefined;

export function startTelemetry(serviceName: string): void {
  if (sdk) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
  sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, "")}/v1/traces`
    })
  });
  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}
