import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { SqlCatalogRepository } from "../../apps/mcp/src/catalog/sqlCatalogRepository.js";
import { selectDiscriminator } from "../../apps/api/src/slices/conversation/domain/discriminator.js";
import { createSlotSet } from "../../apps/api/src/slices/conversation/domain/slots.js";
import { transitionToAwaitingAnswer } from "../../apps/api/src/slices/conversation/domain/funnel.js";

const catalogDatabaseUrl = process.env.CATALOG_DATABASE_URL;

describe("funnel golden queries", () => {
  it.skipIf(!catalogDatabaseUrl)("chooses a question that reduces Cargo 2422 candidates", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    const result = await repository.resolveVehicle({
      catalogId: "eaton",
      model: "Cargo 2422",
      limit: 50
    });
    await pool.end();

    const discriminator = selectDiscriminator(result.candidates.map((candidate) => ({
      description: candidate.description,
      year_text: candidate.yearText
    })));

    expect(discriminator?.attribute).not.toBe("year");
    expect(discriminator?.reduction).toBeGreaterThan(0);
  });

  it("stops asking after at most two questions", () => {
    const discriminator = {
      attribute: "description_token",
      values: [{ value: "6x4", remainingCount: 1 }, { value: "6x2", remainingCount: 2 }],
      reduction: 2
    };
    const secondDiscriminator = {
      attribute: "year",
      values: [{ value: "2010", remainingCount: 1 }, { value: "2011", remainingCount: 2 }],
      reduction: 2
    };

    const first = transitionToAwaitingAnswer(createSlotSet(), discriminator);
    const second = transitionToAwaitingAnswer(first.slotSet, secondDiscriminator);
    const third = transitionToAwaitingAnswer(second.slotSet, discriminator);

    expect(first.state).toBe("awaiting_answer");
    expect(second.state).toBe("awaiting_answer");
    expect(third.state).toBe("choosing");
  });

  it.skipIf(!catalogDatabaseUrl)("offers only values that leave at least one candidate with parts", async () => {
    const pool = new Pool({ connectionString: catalogDatabaseUrl });
    const repository = new SqlCatalogRepository(pool);

    const result = await repository.resolveVehicle({
      catalogId: "eaton",
      model: "Cargo 2422",
      limit: 50
    });
    await pool.end();

    const discriminator = selectDiscriminator(result.candidates.map((candidate) => ({
      description: candidate.description,
      year_text: candidate.yearText
    })));
    expect(discriminator).toBeDefined();

    for (const option of discriminator?.values ?? []) {
      const candidates = result.candidates.filter((candidate) => candidate.description.includes(option.value));
      expect(candidates.some((candidate) => candidate.partCount > 0)).toBe(true);
    }
  });
});
