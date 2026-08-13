import { startTelemetry } from "@nexo/telemetry";
import { buildApp } from "./composition/index.js";

startTelemetry("nexo-api");
const app = await buildApp();
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8080) });
