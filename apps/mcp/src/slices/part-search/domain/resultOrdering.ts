import type { Part } from "@nexo/catalog-core";

export function orderCurrentBeforeObsolete<T extends Pick<Part, "isObsolete" | "partNumber">>(items: T[]): T[] {
  return [...items].sort((left, right) => Number(left.isObsolete) - Number(right.isObsolete) || left.partNumber.localeCompare(right.partNumber));
}
