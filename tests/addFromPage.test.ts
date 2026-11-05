import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultList, productFromQuery, shortcutScript, bookmarklet, storeForLink } from "../src/lib/addFromPage";
import type { ShoppingList, Store } from "../src/api/types";

/**
 * Runs the Shortcut's script on a page, as Safari would, and returns the HList address it produces. `whileWaiting`
 * can change the page while the script waits for it.
 */
async function runOnPage(html: string, url: string, whileWaiting?: (page: Document) => void): Promise<URL> {
  const page = new DOMParser().parseFromString(html, "text/html");
  const location = { href: url, hostname: new URL(url).hostname };
  // The script uses the page's document and location, and hands its result to completion().
  const result = new Promise<string>((resolve) => {
    new Function("document", "location", "completion", shortcutScript("https://hlist.test"))(page, location, resolve);
  });
  whileWaiting?.(page);
  return new URL(await result);
}

afterEach(() => {
  vi.useRealTimers();
});

const store = (key: string, name: string, ...domains: string[]): Store =>
  ({ key, name, site: `https://www.${domains[0]}`, domains, aliases: [], iconUrl: "" });
const STORES = [
  store("publix", "Publix", "publix.com"),
  store("costco", "Costco", "costco.com", "costcobusinessdelivery.com"),
  store("aldi", "Aldi", "aldi.us"),
  store("target", "Target", "target.com"),
];

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
  it("sends a product's name, photo and the text around the name", async () => {
    const url = await runOnPage(PUBLIX_PAGE, "https://www.publix.com/pd/publix-mild-pork-italian-sausage/RIO-PCI-1");

    expect(url.origin + url.pathname).toBe("https://hlist.test/app/add");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: "Publix Mild Pork Italian Sausage, Our Exclusive Recipe",
      photo: "https://images.publixcdn.com/pct/images/products/1/sausage-600x600-A.jpg",
      above: "Meat",
      below: "20 oz Pkg",
      link: "https://www.publix.com/pd/publix-mild-pork-italian-sausage/RIO-PCI-1",
    });
  });

  it("turns a Publix page's text into the store section, size and brand", async () => {
    const url = await runOnPage(PUBLIX_PAGE.replace("Meat", "Aisle 3 - International Foods - Mexican")
      .replace("Publix Mild Pork Italian Sausage, Our Exclusive Recipe</h1>", "Mission Super Soft Extra Thin Yellow Corn Tortillas</h1>")
      .replace("20 oz Pkg", "24 tortillas [16 oz (1 lb) 453 g]"), "https://www.publix.com/pd/mission-tortillas/RIO-PCI-2");

    expect(productFromQuery(Object.fromEntries(url.searchParams))).toMatchObject({
      name: "Mission Super Soft Extra Thin Yellow Corn Tortillas",
      section: "Aisle 3 - International Foods - Mexican",
      size: "24 tortillas [16 oz (1 lb) 453 g]",
      brand: undefined,
    });
    expect(productFromQuery(Object.fromEntries((await runOnPage(PUBLIX_PAGE, "https://www.publix.com/pd/x")).searchParams)))
      .toMatchObject({ section: "Meat", size: "20 oz Pkg", brand: "Publix" });
  });

  it("uses the text around the name only on Publix", async () => {
    const url = await runOnPage(PUBLIX_PAGE, "https://www.example.com/p/sausage");

    expect(productFromQuery(Object.fromEntries(url.searchParams))).toMatchObject({ section: undefined, size: undefined, brand: undefined });
  });

  it("reads only the name and photo elsewhere, falling back to the page title", async () => {
    vi.useFakeTimers();
    const reading = runOnPage(`<html><head><title>Kirkland Almonds, 3 lb | Costco</title>
      <meta property="og:image" content="https://cdn.test/almonds.jpg"></head><body><p>Warehouse</p></body></html>`,
    "https://www.costco.com/almonds.html");
    await vi.advanceTimersByTimeAsync(1500);
    const url = await reading;

    expect(Object.fromEntries(url.searchParams)).toEqual({
      name: "Kirkland Almonds, 3 lb", photo: "https://cdn.test/almonds.jpg", link: "https://www.costco.com/almonds.html",
    });
  });

  it("waits for a page that builds itself to show the product", async () => {
    vi.useFakeTimers();
    const url = await runOnPage("<html><head></head><body><main></main></body></html>",
      "https://www.costco.com/p/-/limes-3-lbs/100443126", (page) => {
        void vi.advanceTimersByTimeAsync(700).then(() => {
          page.title = "Limes, 3 lbs | Costco";
          page.querySelector("main")!.innerHTML = "<div><section><h1>Limes, 3 lbs</h1></section></div>";
        }).then(() => vi.advanceTimersByTimeAsync(500));
      });

    expect(Object.fromEntries(url.searchParams)).toEqual({ name: "Limes, 3 lbs", link: "https://www.costco.com/p/-/limes-3-lbs/100443126" });
  });

  it("settles for og:title without a heading, and sends only the link from a page that stays empty", async () => {
    vi.useFakeTimers();
    const titled = runOnPage(`<html><head><meta property="og:title" content="Limes, 3 lbs | Costco"></head><body></body></html>`,
      "https://www.costco.com/p/-/limes-3-lbs/100443126");
    await vi.advanceTimersByTimeAsync(1500);
    expect((await titled).searchParams.get("name")).toBe("Limes, 3 lbs");

    const empty = runOnPage("<html><head></head><body></body></html>", "https://www.costco.com/p/-/limes-3-lbs/100443126");
    await vi.advanceTimersByTimeAsync(5000);
    const url = await empty;
    expect(Object.fromEntries(url.searchParams)).toEqual({ link: "https://www.costco.com/p/-/limes-3-lbs/100443126" });
    expect(productFromQuery(Object.fromEntries(url.searchParams))).toBeNull();
  });

  it("makes a bookmark that opens HList", () => {
    expect(bookmarklet("https://hlist.test")).toMatch(/^javascript:\(\(\)=>\{\(/);
    expect(bookmarklet("https://hlist.test")).toContain(".then((address)=>{location.href=address.replace(");
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

  it("picks the newest open list for the store", () => {
    const lists = [list(3, "Publix", "publix", true), list(1, "Publix", "publix"), list(2, "Publix again", "publix"), list(4, "Costco", "costco")];

    expect(defaultList(lists, { name: "Milk", link: "https://www.publix.com/pd/milk" }, STORES)?.shoppingListId).toBe(2);
    expect(defaultList(lists, { name: "Onions", link: "https://www.costcobusinessdelivery.com/p/-/yellow-onions-10-lbs/11775270" }, STORES)?.shoppingListId).toBe(4);
    expect(defaultList(lists, { name: "Milk", link: "https://www.aldi.us/milk" }, STORES)).toBeNull();
    expect(defaultList(lists, { name: "Milk", link: "https://www.example.com/target" }, STORES)).toBeNull();
    expect(defaultList(lists, { name: "Milk" }, STORES)).toBeNull();
  });

  it("finds the store of a product's website, for a new list when it has none open", () => {
    const stores = STORES;

    expect(storeForLink(stores, "https://www.publix.com/pd/mission-tortillas/RIO-PCI-123")?.name).toBe("Publix");
    expect(storeForLink(stores, "https://publix.com/pd/x")?.name).toBe("Publix");
    expect(storeForLink(stores, "https://shop.aldi.us/x")?.name).toBe("Aldi");
    expect(storeForLink(stores, "https://www.costcobusinessdelivery.com/p/-/yellow-onions-10-lbs/11775270")?.name).toBe("Costco");
    expect(storeForLink(stores, "https://www.notpublix.com/x")).toBeNull();
    expect(storeForLink(stores, "https://www.example.com/x")).toBeNull();
    expect(storeForLink(stores, undefined)).toBeNull();
  });
});
