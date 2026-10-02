import { describe, expect, it } from "vitest";
import { defaultList, listMatchesLink, productFromQuery, shortcutScript, bookmarklet } from "../src/lib/addFromPage";
import type { ShoppingList } from "../src/api/types";

/** Runs the Shortcut's script on a page, as Safari would, and returns the HList address it produces. */
function runOnPage(html: string, url: string): URL {
  const page = new DOMParser().parseFromString(html, "text/html");
  const location = { href: url, hostname: new URL(url).hostname };
  let result = "";
  // The script uses the page's document and location, and hands its result to completion().
  new Function("document", "location", "completion", shortcutScript("https://hlist.test"))(page, location, (value: string) => (result = value));
  return new URL(result);
}

const PUBLIX_PAGE = `<html><head>
  <meta property="og:title" content="Publix Mild Pork Italian Sausage, Our Exclusive Recipe | Publix Super Markets">
  <meta property="og:image" content="https://images.publixcdn.com/pct/images/products/1/sausage-600x600-A.jpg">
</head><body><main>
  <a href="/back">Back</a>
  <div class="wrap"><div class="chip"><svg></svg><span>Meat</span></div>
    <h1>Publix Mild Pork Italian Sausage, Our Exclusive Recipe</h1>
    <div>20 oz Pkg</div>
  </div>
</main></body></html>`;

describe("the store page script", () => {
  it("sends a product's name, photo and the text around the name", () => {
    const url = runOnPage(PUBLIX_PAGE, "https://www.publix.com/pd/publix-mild-pork-italian-sausage/RIO-PCI-1");

    expect(url.origin + url.pathname).toBe("https://hlist.test/app/add");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: "Publix Mild Pork Italian Sausage, Our Exclusive Recipe",
      photo: "https://images.publixcdn.com/pct/images/products/1/sausage-600x600-A.jpg",
      above: "Meat",
      below: "20 oz Pkg",
      link: "https://www.publix.com/pd/publix-mild-pork-italian-sausage/RIO-PCI-1",
    });
  });

  it("turns a Publix page's text into the store section, size and brand", () => {
    const url = runOnPage(PUBLIX_PAGE.replace("Meat", "Aisle 3 - International Foods - Mexican")
      .replace("Publix Mild Pork Italian Sausage, Our Exclusive Recipe</h1>", "Mission Super Soft Extra Thin Yellow Corn Tortillas</h1>")
      .replace("20 oz Pkg", "24 tortillas [16 oz (1 lb) 453 g]"), "https://www.publix.com/pd/mission-tortillas/RIO-PCI-2");

    expect(productFromQuery(Object.fromEntries(url.searchParams))).toMatchObject({
      name: "Mission Super Soft Extra Thin Yellow Corn Tortillas",
      section: "Aisle 3 - International Foods - Mexican",
      size: "24 tortillas [16 oz (1 lb) 453 g]",
      brand: undefined,
    });
    expect(productFromQuery(Object.fromEntries(runOnPage(PUBLIX_PAGE, "https://www.publix.com/pd/x").searchParams)))
      .toMatchObject({ section: "Meat", size: "20 oz Pkg", brand: "Publix" });
  });

  it("uses the text around the name only on Publix", () => {
    const url = runOnPage(PUBLIX_PAGE, "https://www.example.com/p/sausage");

    expect(productFromQuery(Object.fromEntries(url.searchParams))).toMatchObject({ section: undefined, size: undefined, brand: undefined });
  });

  it("reads only the name and photo elsewhere, falling back to the page title", () => {
    const url = runOnPage(`<html><head><title>Kirkland Almonds, 3 lb | Costco</title>
      <meta property="og:image" content="https://cdn.test/almonds.jpg"></head><body><p>Warehouse</p></body></html>`,
    "https://www.costco.com/almonds.html");

    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: "Kirkland Almonds, 3 lb", photo: "https://cdn.test/almonds.jpg", link: "https://www.costco.com/almonds.html",
    });
  });

  it("makes a bookmark that opens HList", () => {
    expect(bookmarklet("https://hlist.test")).toMatch(/^javascript:\(\(\)=>\{location\.href=/);
    expect(bookmarklet("https://hlist.test")).toContain('"https://hlist.test"');
  });
});

describe("adding a product from a page", () => {
  it("takes the details from the address, keeping only web addresses", () => {
    expect(productFromQuery({ name: " Whole Milk ", photo: "https://cdn.test/m.jpg", link: "javascript:alert(1)", section: "Dairy" }))
      .toEqual({ name: "Whole Milk", photo: "https://cdn.test/m.jpg", section: "Dairy", size: undefined, brand: undefined, link: undefined });
    expect(productFromQuery({ photo: "https://cdn.test/m.jpg" })).toBeNull();
  });

  const list = (id: number, name: string, store: string | null, completed = false): ShoppingList =>
    ({ shoppingListId: id, shoppingListName: name, username: "me", completed, store: store ? { key: store, name: store } : null });

  it("matches lists to the store's website", () => {
    expect(listMatchesLink({ key: "publix", name: "Publix" }, "https://www.publix.com/pd/x")).toBe(true);
    expect(listMatchesLink({ key: "home-depot", name: "Home Depot" }, "https://www.homedepot.com/p/x")).toBe(true);
    expect(listMatchesLink({ key: "target", name: "Target" }, "https://www.publix.com/target-practice")).toBe(false);
    expect(listMatchesLink(null, "https://www.publix.com/")).toBe(false);
  });

  it("picks the newest open list for the store", () => {
    const lists = [list(3, "Publix", "publix", true), list(1, "Publix", "publix"), list(2, "Publix again", "publix"), list(4, "Costco", "costco")];

    expect(defaultList(lists, { name: "Milk", link: "https://www.publix.com/pd/milk" })?.shoppingListId).toBe(2);
    expect(defaultList(lists, { name: "Milk", link: "https://www.aldi.us/milk" })).toBeNull();
    expect(defaultList(lists, { name: "Milk" })).toBeNull();
  });
});
