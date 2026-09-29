import { describe, expect, it } from "vitest";
import { formatDate } from "../src/lib/format";

describe("formatDate", () => {
  it("formats as month day year without a comma", () => {
    // Midday UTC stays on the same calendar day in every time zone the tests could run in.
    expect(formatDate("2026-09-29T12:00:00Z")).toBe("Sep 29 2026");
    expect(formatDate("2026-01-05T12:00:00+00:00")).toBe("Jan 5 2026");
  });

  it("returns an empty string for missing or invalid values", () => {
    expect(formatDate(undefined)).toBe("");
    expect(formatDate(null)).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});
