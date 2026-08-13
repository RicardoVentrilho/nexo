import { describe, expect, it } from "vitest";
import { selectDiscriminator } from "../../apps/api/src/slices/conversation/domain/discriminator.js";

describe("selectDiscriminator", () => {
  it("chooses the attribute that reduces the candidate set most", () => {
    const discriminator = selectDiscriminator([
      candidate("Cargo 2422 6x4", "Todos"),
      candidate("Cargo 2422 6x4", "Todos"),
      candidate("Cargo 2422 6x2", "Todos"),
      candidate("Cargo 2422 6x2", "Todos"),
      candidate("Cargo 2422 4x2", "Todos")
    ]);

    expect(discriminator).toMatchObject({
      attribute: "description_token",
      reduction: 3,
      values: [
        { value: "6x2", remainingCount: 2 },
        { value: "6x4", remainingCount: 2 }
      ]
    });
  });

  it("breaks equal reductions toward fewer distinct values", () => {
    const discriminator = selectDiscriminator([
      candidate("Cargo 2422 A", "2010"),
      candidate("Cargo 2422 A", "2010"),
      candidate("Cargo 2422 B", "2011"),
      candidate("Cargo 2422 B", "2011"),
      candidate("Cargo 2422 B", "2011"),
      candidate("Cargo 2422 C", "2011"),
      candidate("Cargo 2422 C", "2011"),
      candidate("Cargo 2422 C", "2011")
    ]);

    expect(discriminator?.attribute).toBe("year");
    expect(discriminator?.values.map((value) => value.value)).toEqual(["2010", "2011"]);
  });

  it("does not choose attributes that leave the candidate set unchanged", () => {
    const discriminator = selectDiscriminator([
      candidate("Cargo 2422", "Todos"),
      candidate("Cargo 2422", "Todos")
    ]);

    expect(discriminator).toBeUndefined();
  });
});

function candidate(description: string, yearText: string) {
  return {
    application_id: description,
    description,
    year_text: yearText,
    part_count: 1
  };
}
