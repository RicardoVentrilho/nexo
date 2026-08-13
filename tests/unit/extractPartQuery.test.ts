import { describe, expect, it } from "vitest";
import { extractPartQuery } from "../../apps/api/src/slices/conversation/domain/partQuery.js";

describe("extractPartQuery", () => {
  it("keeps only the part term from a full sentence", () => {
    expect(extractPartQuery("Preciso de embreagem para Ford Cargo 2422 6x4")).toBe("embreagem");
  });

  it("keeps multi-word part terms", () => {
    expect(extractPartQuery("quero o cilindro mestre do Cargo 1723")).toBe("cilindro mestre");
  });

  it("preserves accents so the term still matches catalog descriptions", () => {
    expect(extractPartQuery("preciso de válvula")).toBe("válvula");
  });

  it("falls back to the original text when every word is noise", () => {
    expect(extractPartQuery("para o Ford Cargo")).toBe("para o Ford Cargo");
  });
});
