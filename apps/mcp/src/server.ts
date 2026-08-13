import { startTelemetry } from "@nexo/telemetry";
import { createServer } from "node:http";
import { openCatalogDatabase } from "./catalog/connection.js";
import { SqlCatalogRepository } from "./catalog/sqlCatalogRepository.js";
import { GetAssemblies } from "./slices/assemblies/application/getAssemblies.js";
import { FindCrossReference } from "./slices/cross-reference/application/findCrossReference.js";
import { GetPart } from "./slices/part-search/application/getPart.js";
import { ListGroups } from "./slices/part-search/application/listGroups.js";
import { SearchParts } from "./slices/part-search/application/searchParts.js";
import { ListManufacturers } from "./slices/vehicle-resolution/application/listManufacturers.js";
import { ListVehicleModels } from "./slices/vehicle-resolution/application/listVehicleModels.js";
import { ResolveVehicle } from "./slices/vehicle-resolution/application/resolveVehicle.js";

export interface RegisteredTool {
  name: string;
  execute(input: unknown): Promise<unknown>;
}

export function createToolRegistry(): RegisteredTool[] {
  const db = openCatalogDatabase();
  const catalog = new SqlCatalogRepository(db);
  return [
    { name: "search_parts", execute: (input) => new SearchParts(catalog).execute(input) },
    { name: "get_part", execute: (input) => new GetPart(catalog).execute(input) },
    { name: "list_groups", execute: (input) => new ListGroups(catalog).execute(input) },
    { name: "get_assemblies", execute: (input) => new GetAssemblies(catalog).execute(input) },
    { name: "find_cross_reference", execute: (input) => new FindCrossReference(catalog).execute(input) },
    { name: "resolve_vehicle", execute: (input) => new ResolveVehicle(catalog).execute(input) },
    { name: "list_manufacturers", execute: (input) => new ListManufacturers(catalog).execute(input) },
    { name: "list_vehicle_models", execute: (input) => new ListVehicleModels(catalog).execute(input) }
  ];
}

if (process.argv[1]?.endsWith("server.js")) {
  startTelemetry("nexo-mcp");
  const tools = createToolRegistry();
  const port = Number(process.env.PORT ?? 8090);
  createServer((request, response) => {
    void handleRequest(request, response, tools);
  }).listen(port, "0.0.0.0");
}

async function handleRequest(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  tools: RegisteredTool[]
) {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const match = request.url?.match(/^\/tools\/([^/?]+)/);
  if (request.method !== "POST" || !match) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "not_found", message: "Unknown route" } }));
    return;
  }

  const tool = tools.find((candidate) => candidate.name === match[1]);
  if (!tool) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "not_found", message: "Unknown tool" } }));
    return;
  }

  try {
    const input = JSON.parse(await readBody(request)) as unknown;
    const result = await tool.execute(input);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "invalid_arguments", message: error instanceof Error ? error.message : "Tool failed" } }));
  }
}

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body || "{}"));
    request.on("error", reject);
  });
}
