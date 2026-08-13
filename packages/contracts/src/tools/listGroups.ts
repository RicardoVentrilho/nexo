import { z } from "zod";
import { ApplicationId, CatalogId } from "../primitives.js";
import { GroupRef } from "./common.js";

export const ListGroupsInput = z.object({
  parent_group_id: z.string().nullable().optional(),
  application_id: ApplicationId.optional(),
  catalog_id: CatalogId.default("eaton")
});

export const ListGroupsOutput = z.object({
  groups: z.array(GroupRef)
});
