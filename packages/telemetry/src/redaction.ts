const BLOCKED_KEYS = new Set(["message", "prose", "raw_utterance", "authorization", "token", "password", "secret"]);

export function normaliseTelemetryAttributes(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (BLOCKED_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    }
  }
  return output;
}
