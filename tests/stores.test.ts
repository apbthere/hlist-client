import { describe, expect, it } from "vitest";
import { storeIconUrl } from "../src/lib/stores";

describe("storeIconUrl", () => {
  it("points at the server's icon for a recognised store", () => {
    expect(storeIconUrl({ key: "homedepot", name: "Home Depot" })).toBe("/api/store-icons/homedepot");
  });

  it("is null without a store or with an unexpected key", () => {
    expect(storeIconUrl(null)).toBeNull();
    expect(storeIconUrl(undefined)).toBeNull();
    expect(storeIconUrl({ key: "../users/me", name: "x" })).toBeNull();
  });
});
