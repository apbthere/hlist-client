// Adding the product on a store's web page to a list: a bookmark (Mac) or Shortcut (iPad) runs a script on the
// page, which opens HList's /add page with what it found. The page is open in the user's own browser, so this
// works for stores whose pages the server can't download (Publix).

import type { ShoppingList, StoreRef } from "../api/types";

/** What the script found on the product page; everything but the name is optional. */
export interface ProductFromPage {
  name: string;
  /** The product's photo (the page's og:image). */
  photo?: string;
  /** The store's section for the product, e.g. Publix's "Meat" label above the name. */
  section?: string;
  /** Size or package, e.g. "20 oz Pkg". */
  size?: string;
  brand?: string;
  /** The product page. */
  link?: string;
}

/**
 * The script that runs on the product page (as a bookmark it starts with "javascript:"). It only collects: the
 * product's name (the page's main heading, else its og:title without " | Store name"), photo (og:image), and the
 * text just above and just below the name. What that text means is decided by productFromQuery, in HList, so
 * changes to it don't need the bookmark or Shortcut set up again. It's written against the page's layout rather
 * than the site's internal names, so small site changes don't break it.
 */
function readProductPage(): string {
  const meta = (key: string): string => {
    const tag = document.querySelector(`meta[property="${key}"],meta[name="${key}"]`);
    return (tag?.getAttribute("content") ?? "").trim();
  };
  const text = (element: Element | null): string =>
    ((element as HTMLElement | null)?.innerText ?? element?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const heading = document.querySelector("main h1, h1");
  let name = text(heading);
  if (!name) name = (meta("og:title") || document.title).replace(/\s+[|\u2013\u2014-]\s+[^|\u2013\u2014]+$/, "").trim();
  const found: Record<string, string> = { name, photo: meta("og:image"), link: location.href };
  if (heading) {
    // The nearest text before the name, looking up to three levels out (Publix: the store section label).
    for (let node: Element | null = heading, depth = 0; node && depth < 3 && !found.above; node = node.parentElement, depth++) {
      for (let before = node.previousElementSibling; before && !found.above; before = before.previousElementSibling) {
        found.above = text(before);
      }
    }
    found.below = text(heading.nextElementSibling);
  }
  const query = Object.keys(found).filter((key) => found[key]).map((key) => `${key}=${encodeURIComponent(found[key])}`).join("&");
  return `__HLIST__/app/add?${query}`;
}

/** The bookmark's address: drag it to Safari's Favorites bar, then click it on a product page. */
export function bookmarklet(origin: string): string {
  return `javascript:(()=>{location.href=(${readProductPage.toString()})().replace("__HLIST__",${JSON.stringify(origin)})})()`;
}

/** The iPad Shortcut's "Run JavaScript on Web Page" script; the Shortcut then opens the address it returns. */
export function shortcutScript(origin: string): string {
  return `completion((${readProductPage.toString()})().replace("__HLIST__", ${JSON.stringify(origin)}));`;
}

function isPublix(link: string | undefined): boolean {
  try {
    return link !== undefined && /(^|\.)publix\.com$/i.test(new URL(link).hostname);
  } catch {
    return false;
  }
}

/**
 * The product details from /add's query, or null without a name. Addresses must be web addresses. On Publix, with
 * a store chosen, the text above the name is the product's place in that store ("Aisle 3 - International Foods -
 * Mexican", "Meat") and the text below it the size ("24 tortillas [16 oz (1 lb) 453 g]"); Publix's own products
 * are brand Publix. (Bookmarks set up before October 2026 send section, size and brand themselves.)
 */
export function productFromQuery(query: Record<string, unknown>): ProductFromPage | null {
  const value = (key: string, max: number): string | undefined => {
    const raw = query[key];
    const text = (Array.isArray(raw) ? raw[0] : raw);
    return typeof text === "string" && text.trim() ? text.trim().replace(/\s+/g, " ").slice(0, max) : undefined;
  };
  const address = (key: string): string | undefined => {
    const text = value(key, 2000);
    return text && /^https?:\/\//i.test(text) ? text : undefined;
  };
  const name = value("name", 255);
  if (!name) return null;
  const link = address("link");
  let section = value("section", 100);
  let size = value("size", 100);
  let brand = value("brand", 60);
  if (isPublix(link)) {
    const above = value("above", 200);
    const below = value("below", 200);
    if (!section && above && above.length <= 100 && !/^back$/i.test(above)) section = above;
    if (!size && below && below.length <= 100 && /\d/.test(below)) size = below;
    if (!brand && /^publix\s/i.test(name)) brand = "Publix";
  }
  return { name, photo: address("photo"), section, size, brand, link };
}

/** Whether a list is for the store whose site the product came from (publix.com → a "Publix" list). */
export function listMatchesLink(store: StoreRef | null | undefined, link: string | undefined): boolean {
  if (!store?.key || !link) return false;
  try {
    const host = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
    const key = store.key.toLowerCase().replace(/[^a-z0-9]/g, "");
    return key.length > 0 && host.replace(/[^a-z0-9.]/g, "").split(".").some((part) => part === key);
  } catch {
    return false;
  }
}

/** The list to add the product to without asking: the newest open list for the product's store, if any. */
export function defaultList(lists: ShoppingList[], product: ProductFromPage): ShoppingList | null {
  return newestFirst(lists).find((list) => !list.completed && listMatchesLink(list.store, product.link)) ?? null;
}

/** Lists newest first (the server returns them in no particular order). */
export function newestFirst(lists: ShoppingList[]): ShoppingList[] {
  return [...lists].sort((a, b) => b.shoppingListId - a.shoppingListId);
}

// The product waiting for its list's screen to open the New Item sheet.
let pending: { listId: number; product: ProductFromPage } | null = null;

export function setPendingProduct(listId: number, product: ProductFromPage): void {
  pending = { listId, product };
}

export function takePendingProduct(listId: number): ProductFromPage | null {
  if (pending?.listId !== listId) return null;
  const { product } = pending;
  pending = null;
  return product;
}
