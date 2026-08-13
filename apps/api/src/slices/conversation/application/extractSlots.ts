import { z } from "zod";
import type OpenAI from "openai";
import type { StatedSlots } from "../domain/slots.js";

const ExtractedSlots = z.object({
  manufacturer: z.string().min(1).nullable().optional(),
  model: z.string().min(1).nullable().optional(),
  variant: z.string().min(1).nullable().optional(),
  year: z.number().int().nullable().optional(),
  partTerm: z.string().min(1).nullable().optional()
}).strict();

const slotProperties = {
  manufacturer: { type: ["string", "null"] },
  model: { type: ["string", "null"] },
  variant: { type: ["string", "null"] },
  year: { type: ["integer", "null"] },
  partTerm: { type: ["string", "null"] }
} as const;

export const conversationSlotsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(slotProperties),
  properties: slotProperties
} as const;

export async function extractSlots(openAi: OpenAI, model: string, message: string): Promise<StatedSlots> {
  const completion = await openAi.chat.completions.create({
    model,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "conversation_slots",
        strict: true,
        schema: conversationSlotsJsonSchema
      }
    },
    messages: [
      {
        role: "system",
        content: [
          "Extraia detalhes de pedidos de pecas em portugues.",
          "Retorne somente JSON validado pelo schema.",
          "manufacturer, model, variant, year e partTerm sao opcionais.",
          "Nao confirme dados de catalogo; apenas transcreva o que o usuario informou."
        ].join(" ")
      },
      { role: "user", content: message }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) return {};
  return compactSlots(ExtractedSlots.parse(JSON.parse(content)));
}

function compactSlots(slots: z.infer<typeof ExtractedSlots>): StatedSlots {
  const compacted: StatedSlots = {};
  const normalizedVehicle = normalizeModelVariant(slots.model, slots.variant);
  if (slots.manufacturer !== undefined && slots.manufacturer !== null) compacted.manufacturer = slots.manufacturer;
  if (normalizedVehicle.model !== undefined && normalizedVehicle.model !== null) compacted.model = normalizedVehicle.model;
  if (normalizedVehicle.variant !== undefined && normalizedVehicle.variant !== null) compacted.variant = normalizedVehicle.variant;
  if (slots.year !== undefined && slots.year !== null) compacted.year = slots.year;
  if (slots.partTerm !== undefined && slots.partTerm !== null) compacted.partTerm = slots.partTerm;
  return compacted;
}

function normalizeModelVariant(model: string | null | undefined, variant: string | null | undefined): { model: string | null | undefined; variant: string | null | undefined } {
  if (model == null || variant == null) return { model, variant };
  const match = variant.match(/^(\d{2,5})(?:\s+(.+))?$/);
  if (!match) return { model, variant };
  return {
    model: `${model} ${match[1]}`,
    variant: match[2] ?? null
  };
}
