import { describe, expect, it } from "vitest";
import type { Item, ListItem } from "../src/api/types";
import {
  capitalizeWords, findCatalogMatch, groupByDepartment, isPhoneticMatch, normalizeItemName, parseItemPattern, soundex, suggestItems,
} from "../src/lib/items";

function item(itemId: number, itemName: string, departmentId: number | null = null, brandId: number | null = null): Item {
  return { itemId, itemName, quantity: 1, departmentId, brandId, itemComment: null, username: "u" };
}

function listItem(itemId: number, itemName: string, departmentId: number | null, completed = false): ListItem {
  return { ...item(itemId, itemName, departmentId), completed };
}

describe("soundex", () => {
  it("encodes names like the web UI", () => {
    expect(soundex("Robert")).toBe("R163");
    expect(soundex("Rupert")).toBe("R163");
    expect(soundex("Tymczak")).toBe("T522");
    expect(soundex("")).toBe("");
    expect(soundex("123")).toBe("");
  });
});

describe("isPhoneticMatch", () => {
  it("matches substrings, word prefixes and sounds-alike words", () => {
    expect(isPhoneticMatch("Oat milk", "mil")).toBe(true);
    expect(isPhoneticMatch("Greek yogurt", "yog")).toBe(true);
    expect(isPhoneticMatch("Yoghurt", "yogurt")).toBe(true);
    expect(isPhoneticMatch("Bread", "cheese")).toBe(false);
  });
});

describe("parseItemPattern", () => {
  it("splits the item, brand and department", () => {
    expect(parseItemPattern("Milk by Horizon in Dairy")).toEqual({
      itemName: "Milk", brandName: "Horizon", departmentName: "Dairy",
    });
    expect(parseItemPattern("  Peanut butter  BY Jif in Pantry aisle ")).toEqual({
      itemName: "Peanut butter", brandName: "Jif", departmentName: "Pantry aisle",
    });
  });

  it("ignores plain names", () => {
    expect(parseItemPattern("Milk")).toBeNull();
    expect(parseItemPattern("Milk by Horizon")).toBeNull();
  });
});

describe("capitalizeWords", () => {
  it("capitalizes lowercase words and keeps deliberate casing", () => {
    expect(capitalizeWords("kirkland")).toBe("Kirkland");
    expect(capitalizeWords("  kirkland   signature ")).toBe("Kirkland Signature");
    expect(capitalizeWords("iPhone accessories")).toBe("iPhone Accessories");
    expect(capitalizeWords("HEB")).toBe("HEB");
  });
});

describe("parseItemPattern with lowercase input", () => {
  it("parses the example from the item editor", () => {
    expect(parseItemPattern("milk by kirkland in diary")).toEqual({
      itemName: "milk", brandName: "kirkland", departmentName: "diary",
    });
  });

  it("matches a misspelled department to the existing one by sound", () => {
    expect(findCatalogMatch(new Map([[7, "Dairy"]]), "diary")).toBe(7);
  });
});

describe("normalizeItemName", () => {
  it("trims, collapses spaces and lowercases", () => {
    expect(normalizeItemName("  Oat   Milk ")).toBe("oat milk");
  });
});

describe("findCatalogMatch", () => {
  const catalog = new Map([[1, "Dairy"], [2, "Produce"]]);

  it("finds exact and sounds-alike names", () => {
    expect(findCatalogMatch(catalog, "dairy")).toBe(1);
    expect(findCatalogMatch(catalog, "Dairee")).toBe(1);
    expect(findCatalogMatch(catalog, "Bakery")).toBeNull();
  });
});

describe("suggestItems", () => {
  it("dedupes, prefers prefix matches and limits results", () => {
    const previous = [item(1, "Oat milk", 1), item(2, "Milk", 1), item(3, "Milk", 1), item(4, "Milk", 2), item(5, "Bread")];
    const names = suggestItems(previous, "mil").map((suggestion) => suggestion.itemId);
    expect(names).toEqual([2, 4, 1]);
    expect(suggestItems(previous, "mil", 1)).toHaveLength(1);
    expect(suggestItems(previous, "  ")).toEqual([]);
  });
});

describe("groupByDepartment", () => {
  it("sorts departments by name with Other last and items by name", () => {
    const departments = new Map([[1, "Produce"], [2, "Dairy"]]);
    const groups = groupByDepartment([
      listItem(1, "bananas", 1),
      listItem(2, "Yogurt", 2),
      listItem(3, "Apples", 1),
      listItem(4, "Batteries", null),
      listItem(5, "Mystery", 99),
      listItem(6, "Butter", 2),
    ], departments);
    expect(groups.map((group) => group.title)).toEqual(["Dairy", "Produce", "Other"]);
    expect(groups[0].items.map((entry) => entry.itemName)).toEqual(["Butter", "Yogurt"]);
    expect(groups[1].items.map((entry) => entry.itemName)).toEqual(["Apples", "bananas"]);
    expect(groups[2].items.map((entry) => entry.itemName)).toEqual(["Batteries", "Mystery"]);
  });
});
