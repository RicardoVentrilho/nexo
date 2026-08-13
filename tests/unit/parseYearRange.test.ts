import { describe, expect, it } from "vitest";
import { parseYearRange } from "../../packages/catalog-import/src/adapters/eaton/parseYearRange.js";

describe("parseYearRange", () => {
  it.each([
    ["", null, null],
    ["Todos", null, null],
    ["-", null, null],
    ["Sem ano", null, null],
    ["Até 2016", null, 2016],
    ["A partir 2005", 2005, null],
    ["2012/...", 2012, null],
    ["2012/", 2012, null],
    ["2012/2014", 2012, 2014],
    ["2014 a 2012", 2012, 2014],
    ["texto 18", null, null]
  ])("%s -> (%s, %s)", (input, from, to) => {
    expect(parseYearRange(input)).toEqual({ from, to });
  });
});
