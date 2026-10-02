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
 * The script that runs on the product page (as a bookmark it starts with "javascript:"). It reads the product's
 * name (the page's main heading, else its og:title without " | Store name") and photo (og:image). On Publix it
 * also reads the store section shown above the name and the size below it, which appear once a store is chosen.
 * It's written against the page's layout rather than the site's internal names, so small site changes don't
 * break it. Kept to plain ES5-style code so it runs anywhere.
 */
function readProductPage(): string {
  const meta = (key: string): string => {
    const tag = document.querySelector(`meta[property="${key}"],meta[name="${key}"]`);
    return (tag?.getAttribute("content") ?? "").trim();
  };
  const text = (element: Element | null): string =>
    ((element as HTMLElement | null)?.innerText ?? element?.textContent ?? "").replace(/\s+/g, " ").trim();
  const heading = document.querySelector("main h1, h1");
  let name = text(heading);
  if (!name) name = (meta("og:title") || document.title).replace(/\s+[|–—-]\s+[^|–—]+$/, "").trim();
  const found: Record<string, string> = { name, photo: meta("og:image"), link: location.href };
  if (/(^|\.)publix\.com$/.test(location.hostname) && heading) {
    // The short label just above the name (with a pin icon) is the product's section in the chosen store.
    for (let node: Element | null = heading, depth = 0; node && depth < 3 && !found.section; node = node.parentElement, depth++) {
      for (let before = node.previousElementSibling; before && !found.section; before = before.previousElementSibling) {
        const label = text(before);
        if (label && label.length <= 30 && !/back/i.test(label)) found.section = label;
        if (label) break;
      }
    }
    const after = text(heading.nextElementSibling);
    if (after && after.length <= 30 && /\d/.test(after)) found.size = after;
    if (/^publix\s/i.test(name)) found.brand = "Publix";
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

/** The product details from /add's query, or null without a name. Addresses must be web addresses. */
export function productFromQuery(query: Record<string, unknown>): ProductFromPage | null {
  const value = (key: string, max: number): string | undefined => {
    const raw = query[key];
    const text = (Array.isArray(raw) ? raw[0] : raw);
    return typeof text === "string" && text.trim() ? text.trim().slice(0, max) : undefined;
  };
  const address = (key: string): string | undefined => {
    const text = value(key, 2000);
    return text && /^https?:\/\//i.test(text) ? text : undefined;
  };
  const name = value("name", 255);
  if (!name) return null;
  return { name, photo: address("photo"), section: value("section", 60), size: value("size", 60), brand: value("brand", 60), link: address("link") };
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
