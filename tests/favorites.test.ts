import { describe, expect, it } from "vitest";
import type { Favorite, FavoriteStore, ShoppingList } from "../src/api/types";
import {
  categoriesOf, describeFavorite, favoriteFor, groupByCategory, guessCategory, listChoices, searchFavorites,
} from "../src/lib/favorites";

function store(name: string, price: number | null = null, key: string | null = name.toLowerCase()): FavoriteStore {
  return { name, key, price, size: null, productUrl: null, priceCheckedAt: null };
}

function favorite(favoriteId: number, name: string, category: string | null, stores: FavoriteStore[] = [], brandId: number | null = null): Favorite {
  return { favoriteId, name, brandId, departmentId: null, category, comment: null, photoId: null, stores };
}

function list(shoppingListId: number, name: string, storeKey: string | null, completed = false): ShoppingList {
  return {
    shoppingListId, shoppingListName: name, username: "u", completed,
    store: storeKey ? { key: storeKey, name: storeKey[0].toUpperCase() + storeKey.slice(1) } : null,
  };
}

const brands = new Map([[1, "Lavazza"], [2, "Gekkeikan"]]);

describe("groupByCategory", () => {
  it("sorts categories and names, with Other last", () => {
    const groups = groupByCategory([
      favorite(1, "Super Crema", "Coffee"),
      favorite(2, "Paper Towels", null),
      favorite(3, "Junmai", "Sake"),
      favorite(4, "Espresso", "Coffee"),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["Coffee", "Sake", "Other"]);
    expect(groups[0].favorites.map((found) => found.name)).toEqual(["Espresso", "Super Crema"]);
  });
});

describe("searchFavorites", () => {
  const favorites = [
    favorite(1, "Super Crema", "Coffee", [store("Costco", 21.99)], 1),
    favorite(2, "Junmai", "Sake", [store("Total Wine", null, null)], 2),
  ];

  it("matches every word in the name, brand, category or stores", () => {
    expect(searchFavorites(favorites, "lavazza", brands).map((found) => found.favoriteId)).toEqual([1]);
    expect(searchFavorites(favorites, "sake total", brands).map((found) => found.favoriteId)).toEqual([2]);
    expect(searchFavorites(favorites, "coffee costco", brands).map((found) => found.favoriteId)).toEqual([1]);
    expect(searchFavorites(favorites, "coffee wine", brands)).toEqual([]);
    expect(searchFavorites(favorites, "  ", brands)).toHaveLength(2);
  });
});

describe("favoriteFor", () => {
  it("matches name and brand", () => {
    const favorites = [favorite(1, "Super Crema", "Coffee", [], 1)];
    expect(favoriteFor({ itemName: "super  crema", brandId: 1 }, favorites)?.favoriteId).toBe(1);
    expect(favoriteFor({ itemName: "Super Crema", brandId: 2 }, favorites)).toBeUndefined();
  });
});

describe("guessCategory", () => {
  it("finds a category named in the item's name", () => {
    expect(guessCategory("Whole Bean Coffee", ["Sake", "Coffee"])).toBe("Coffee");
    expect(guessCategory("Paper Towels", ["Paper Towel"])).toBe("Paper Towel");
    expect(guessCategory("Milk", ["Coffee"])).toBeNull();
  });
});

describe("categoriesOf", () => {
  it("lists the most used first", () => {
    expect(categoriesOf([favorite(1, "a", "Sake"), favorite(2, "b", "Coffee"), favorite(3, "c", "Coffee"), favorite(4, "d", null)]))
      .toEqual(["Coffee", "Sake"]);
  });
});

describe("describeFavorite", () => {
  it("names the brand and the stores with prices", () => {
    expect(describeFavorite(favorite(1, "Super Crema", null, [store("Publix", 15.49), store("Costco")], 1), brands))
      .toBe("Lavazza · Publix $15.49, Costco");
  });
});

describe("listChoices", () => {
  it("offers open lists of the cheapest stores first", () => {
    const coffee = favorite(1, "Super Crema", "Coffee", [store("Publix", 15.49), store("Costco", 21.99)]);
    const choices = listChoices(coffee, [
      list(1, "Weekend", null),
      list(2, "Costco run", "costco"),
      list(3, "Publix", "publix"),
      list(4, "Old Publix", "publix", true),
    ]);
    expect(choices.map((choice) => choice.list.shoppingListId)).toEqual([3, 2, 1]);
    expect(choices[0].store?.price).toBe(15.49);
    expect(choices[2].store).toBeUndefined();
  });
});
