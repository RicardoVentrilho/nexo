import OpenAI from "openai";

export function createOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }
  return new OpenAI({ apiKey });
}

export function getOpenAiModel(): string {
  const model = process.env.OPENAI_MODEL;
  if (!model) {
    throw new Error("OPENAI_MODEL is required");
  }
  return model;
}
