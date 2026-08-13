import type { CatalogReadRepository } from "@nexo/catalog-core";
import { ListGroupsInput, ListGroupsOutput } from "@nexo/contracts/tools";

export class ListGroups {
  constructor(private readonly catalog: CatalogReadRepository) {}

  async execute(input: unknown) {
    const parsed = ListGroupsInput.parse(input);
    const groups = await this.catalog.listGroups({
      catalogId: parsed.catalog_id,
      ...(parsed.parent_group_id !== undefined ? { parentGroupId: parsed.parent_group_id } : {}),
      ...(parsed.application_id ? { applicationId: parsed.application_id } : {})
    });
    return ListGroupsOutput.parse({
      groups: groups.map((group) => ({
        group_id: group.groupId,
        description: group.description,
        part_count: group.partCount
      }))
    });
  }
}
