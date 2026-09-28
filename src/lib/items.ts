// Item matching and grouping. The matching rules mirror the server's web UI (shopping-list-items.html)
// so suggestions behave the same in both clients.

import type { Item, ListItem } from "../api/types";

/** American Soundex code (e.g. "Robert" -> "R163"), used for sounds-alike matching. */
export function soundex(value: string | null | undefined): string {
  const letters = String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!letters) return "";
  const codes: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3", L: "4", M: "5", N: "5", R: "6",
  };
  let result = letters[0];
  let previousCode = codes[letters[0]] ?? "";
  for (const letter of letters.slice(1)) {
    const code = codes[letter] ?? "";
    if (code && code !== previousCode) result += code;
    previousCode = code;
    if (result.length === 4) break;
  }
  return (result + "000").slice(0, 4);
}

/** True when the name contains the query, a word starts with it, or it sounds alike. */
export function isPhoneticMatch(name: string, query: string): boolean {
  const normalizedName = name.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const querySound = soundex(query);
  return normalizedName.includes(normalizedQuery)
    || normalizedName.split(/\s+/).some((word) => word.startsWith(normalizedQuery))
    || soundex(name) === querySound
    || name.split(/\s+/).some((word) => soundex(word) === querySound);
}

export function normalizeItemName(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface ItemPattern {
  itemName: string;
  brandName: string;
  departmentName: string;
}

/** Parses the "<item> by <brand> in <department>" shortcut, e.g. "Milk by Horizon in Dairy". */
export function parseItemPattern(value: string): ItemPattern | null {
  const match = value.trim().match(/^(.+?)\s+by\s+(.+?)\s+in\s+(.+)$/i);
  if (!match) return null;
  return { itemName: match[1].trim(), brandName: match[2].trim(), departmentName: match[3].trim() };
}

/**
 * Capitalizes words typed all in lowercase ("kirkland signature" -> "Kirkland Signature"),
 * leaving deliberate casing such as "iPhone" or "HEB" alone.
 */
export function capitalizeWords(value: string): string {
  return value.trim().replace(/\s+/g, " ").split(" ")
    .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Finds an existing catalog entry by exact (case-insensitive) or sounds-alike name. */
export function findCatalogMatch(catalog: Map<number, string>, name: string): number | null {
  const normalizedName = name.toLowerCase();
  const nameSound = soundex(name);
  for (const [id, value] of catalog) {
    if (value.toLowerCase() === normalizedName || soundex(value) === nameSound) return id;
  }
  return null;
}

/**
 * Up to `limit` distinct previous items matching the query, preferring names that start with it.
 * Items with the same name, department and brand are shown once.
 */
export function suggestItems(previousItems: Item[], query: string, limit = 6): Item[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const lowerQuery = trimmed.toLowerCase();
  const seen = new Set<string>();
  return previousItems
    .filter((item) => isPhoneticMatch(item.itemName, trimmed))
    .filter((item) => {
      const key = `${normalizeItemName(item.itemName)}|${item.departmentId ?? ""}|${item.brandId ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((first, second) =>
      Number(second.itemName.toLowerCase().startsWith(lowerQuery))
      - Number(first.itemName.toLowerCase().startsWith(lowerQuery)))
    .slice(0, limit);
}

/** How many of the items are still to buy (not checked off). */
export function countToBuy(items: ListItem[]): number {
  return items.filter((item) => !item.completed).length;
}

export interface DepartmentGroup {
  /** null for items without a department. */
  departmentId: number | null;
  title: string;
  items: ListItem[];
}

/**
 * Groups items by department, departments alphabetically with "Other" (no department) last,
 * items alphabetically within each group.
 */
export function groupByDepartment(items: ListItem[], departments: Map<number, string>): DepartmentGroup[] {
  const groups = new Map<number | null, DepartmentGroup>();
  for (const item of items) {
    const known = item.departmentId !== null && departments.has(item.departmentId);
    const key = known ? item.departmentId : null;
    let group = groups.get(key);
    if (!group) {
      group = { departmentId: key, title: known ? departments.get(key as number)! : "Other", items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  const byName = (first: string, second: string) => first.localeCompare(second, undefined, { sensitivity: "base" });
  for (const group of groups.values()) group.items.sort((first, second) => byName(first.itemName, second.itemName));
  return [...groups.values()].sort((first, second) => {
    if (first.departmentId === null) return 1;
    if (second.departmentId === null) return -1;
    return byName(first.title, second.title);
  });
}
