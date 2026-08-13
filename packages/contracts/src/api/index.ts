import { z } from "zod";
import { GroupRef, ManufacturerRef, PartResult, VehicleCandidate, VehicleModelRef } from "../tools/common.js";
import { FindCrossReferenceOutput } from "../tools/findCrossReference.js";
import { GetAssembliesOutput } from "../tools/getAssemblies.js";

export const TurnRequest = z.object({
  message: z.string().min(1)
});

export const Card = z.object({
  cardId: z.number().int().positive(),
  kind: z.enum(["part", "vehicle_candidate", "assembly", "cross_reference", "manufacturer", "vehicle_model", "group"]),
  payload: z.union([PartResult, VehicleCandidate, GetAssembliesOutput, FindCrossReferenceOutput, ManufacturerRef, VehicleModelRef, GroupRef]),
  sourceToolCall: z.string()
});

export const Notice = z.object({
  code: z.enum([
    "year_widened",
    "no_results",
    "catalog_unavailable",
    "truncated",
    "grounding_violation",
    "unauthenticated",
    "question_skipped",
    "vehicle_ambiguous"
  ]),
  message: z.string()
});

export const Question = z.object({
  attribute: z.string(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string()
  })),
  skippable: z.boolean()
});

export const TurnResponse = z.object({
  turnId: z.string(),
  prose: z.string(),
  cards: z.array(Card),
  notices: z.array(Notice),
  state: z.enum(["released", "needs_choice", "needs_input"]),
  question: Question.optional()
}).superRefine((response, ctx) => {
  if (response.state === "needs_input" && !response.question) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["question"],
      message: "question is required when state is needs_input"
    });
  }
  if (response.state !== "needs_input" && response.question) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["question"],
      message: "question is only allowed when state is needs_input"
    });
  }
});

export const SessionInfo = z.object({
  subject: z.string(),
  displayName: z.string(),
  roles: z.array(z.enum(["user", "administrator"]))
});

export type TurnRequest = z.infer<typeof TurnRequest>;
export type Card = z.infer<typeof Card>;
export type Notice = z.infer<typeof Notice>;
export type Question = z.infer<typeof Question>;
export type TurnResponse = z.infer<typeof TurnResponse>;
export type SessionInfo = z.infer<typeof SessionInfo>;
