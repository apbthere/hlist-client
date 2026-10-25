// Favorites: grouping by category, search, matching list items to favorites, and the stores' prices.

import type { Favorite, FavoriteStore, ListItem, ShoppingList } from "../api/types";
import { isPhoneticMatch, normalizeItemName } from "./items";

export interface CategoryGroup {
  /** null for favorites without a category. */
  category: string | null;
  title: string;
  favorites: Favorite[];
}

const byName = (first: string, second: string) => first.localeCompare(second, undefined, { sensitivity: "base" });

/** Groups favorites by category, categories alphabetically with "Other" last, favorites by name within each. */
export function groupByCategory(favorites: Favorite[]): CategoryGroup[] {
  const groups = new Map<string | null, CategoryGroup>();
  for (const favorite of favorites) {
    const key = favorite.category?.trim() || null;
    let group = groups.get(key);
    if (!group) {
      group = { category: key, title: key ?? "Other", favorites: [] };
      groups.set(key, group);
    }
    group.favorites.push(favorite);
  }
  for (const group of groups.values()) group.favorites.sort((first, second) => byName(first.name, second.name));
  return [...groups.values()].sort((first, second) => {
    if (first.category === null) return 1;
    if (second.category === null) return -1;
    return byName(first.title, second.title);
  });
}

/**
 * The favorites matching every word of the query in their name, brand, category, notes or stores (a word's
 * start, or a sounds-alike spelling); all of them for an empty query.
 */
export function searchFavorites(favorites: Favorite[], query: string, brands: Map<number, string>): Favorite[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return favorites;
  return favorites.filter((favorite) => {
    const text = [
      favorite.name,
      favorite.brandId !== null ? brands.get(favorite.brandId) : "",
      favorite.category,
      favorite.comment,
      ...favorite.stores.map((store) => store.name),
    ].filter(Boolean).join(" ");
    return words.every((word) => isPhoneticMatch(text, word));
  });
}

/** The favorite for an item: the same name (ignoring case and spacing) and brand. */
export function favoriteFor(item: Pick<ListItem, "itemName" | "brandId">, favorites: Favorite[]): Favorite | undefined {
  const name = normalizeItemName(item.itemName);
  return favorites.find((favorite) => normalizeItemName(favorite.name) === name && favorite.brandId === item.brandId);
}

/**
 * The category an item probably belongs in: an existing category named in the item's name ("Coffee Beans" →
 * Coffee, "Junmai Sake" → Sake), ignoring a plural "s"; null when none is.
 */
export function guessCategory(itemName: string, categories: string[]): string | null {
  const words = itemName.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(singular);
  return categories.find((category) => {
    const categoryWords = category.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(singular);
    return categoryWords.length > 0 && categoryWords.every((word) => words.includes(word));
  }) ?? null;
}

function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** The user's categories, most used first. */
export function categoriesOf(favorites: Favorite[]): string[] {
  const counts = new Map<string, number>();
  for (const favorite of favorites) {
    const category = favorite.category?.trim();
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((first, second) => second[1] - first[1] || byName(first[0], second[0]))
    .map(([category]) => category);
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/** "Costco $21.99", or just the store's name without a price. */
export function describeStore(store: FavoriteStore): string {
  return store.price === null ? store.name : `${store.name} ${formatPrice(store.price)}`;
}

/** The secondary line of a favorite: brand, then where it's sold (cheapest first). */
export function describeFavorite(favorite: Favorite, brands: Map<number, string>): string {
  const brand = favorite.brandId !== null ? brands.get(favorite.brandId) : undefined;
  return [brand, favorite.stores.map(describeStore).join(", ")].filter(Boolean).join(" · ");
}

export interface ListChoice {
  list: ShoppingList;
  /** The favorite's store matching the list's store, with its price, if any. */
  store?: FavoriteStore;
}

/**
 * The open lists to offer for a favorite: lists of stores that sell it first, cheapest first, then the others,
 * newest first (the order they come in).
 */
export function listChoices(favorite: Favorite, lists: ShoppingList[]): ListChoice[] {
  const open = lists.filter((list) => !list.completed);
  const storeOf = (list: ShoppingList) => favorite.stores.find((store) =>
    (store.key !== null && store.key === list.store?.key) || normalizeItemName(store.name) === normalizeItemName(list.store?.name));
  const choices = open.map((list) => ({ list, store: storeOf(list) }));
  const rank = (choice: ListChoice) => (choice.store ? favorite.stores.indexOf(choice.store) : favorite.stores.length);
  return choices
    .map((choice, index) => ({ choice, index }))
    .sort((first, second) => rank(first.choice) - rank(second.choice) || first.index - second.index)
    .map(({ choice }) => choice);
}
