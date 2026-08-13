import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { conversationSlotsJsonSchema, extractSlots } from "../../apps/api/src/slices/conversation/application/extractSlots.js";

describe("extractSlots", () => {
  it("uses an OpenAI-compatible strict JSON schema", () => {
    expect(conversationSlotsJsonSchema.required).toEqual(["manufacturer", "model", "variant", "year", "partTerm"]);
    expect(conversationSlotsJsonSchema.properties.manufacturer.type).toEqual(["string", "null"]);
  });

  it("extracts Portuguese request details with structured output settings", async () => {
    const calls: unknown[] = [];
    const openAi = fakeOpenAi({
      manufacturer: "Ford",
      model: "Cargo 2422",
      variant: "6x4",
      year: null,
      partTerm: "embreagem"
    }, calls);

    const result = await extractSlots(openAi, "test-model", "Preciso de embreagem para Ford Cargo 2422 6x4");

    expect(result).toEqual({
      manufacturer: "Ford",
      model: "Cargo 2422",
      variant: "6x4",
      partTerm: "embreagem"
    });
    expect(calls[0]).toMatchObject({
      model: "test-model",
      temperature: 0,
      response_format: {
        type: "json_schema"
      }
    });
  });

  it("keeps numeric model suffixes with the model instead of the variant", async () => {
    const result = await extractSlots(fakeOpenAi({
      manufacturer: "Ford",
      model: "Cargo",
      variant: "2422 6x4",
      year: null,
      partTerm: "embreagem"
    }, []), "test-model", "Preciso de embreagem para Ford Cargo 2422 6x4");

    expect(result).toEqual({
      manufacturer: "Ford",
      model: "Cargo 2422",
      variant: "6x4",
      partTerm: "embreagem"
    });
  });

  it("treats a lone numeric suffix as part of the model", async () => {
    const result = await extractSlots(fakeOpenAi({
      manufacturer: null,
      model: "Cargo",
      variant: "2422",
      year: null,
      partTerm: "embreagem"
    }, []), "test-model", "embreagem para Cargo 2422");

    expect(result).toEqual({
      model: "Cargo 2422",
      partTerm: "embreagem"
    });
  });

  it("rejects malformed model output before it can become slot state", async () => {
    const openAi = fakeRawOpenAi("{\"year\":\"dois mil\"}");

    await expect(extractSlots(openAi, "test-model", "Cargo dois mil")).rejects.toThrow();
  });
});

function fakeOpenAi(content: unknown, calls: unknown[]): OpenAI {
  return fakeRawOpenAi(JSON.stringify(content), calls);
}

function fakeRawOpenAi(content: string, calls: unknown[] = []): OpenAI {
  return {
    chat: {
      completions: {
        create: async (input: unknown) => {
          calls.push(input);
          return {
            choices: [{
              message: {
                role: "assistant",
                content
              }
            }]
          };
        }
      }
    }
  } as unknown as OpenAI;
}
