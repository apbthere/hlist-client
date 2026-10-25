// Favorites in WebKit on an iPad: favoriting an item on a list, the Favorites page (categories, search, prices),
// and adding favorites to lists, one at a time and several from a list's options.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { apiFetch, baseUrl, openBrowser, screenshot, signUp, startServer } from "./harness.mjs";

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

/** Opens an item's swipe actions on one side ("start" or "end"), as a swipe would. */
async function openSwipe(page, text, side) {
  const sliding = page.locator("ion-item-sliding", { hasText: text }).first();
  await sliding.evaluate((element, which) => element.open(which), side);
  await page.waitForTimeout(400);
  return sliding;
}

test("items become favorites, grouped by category, and go on the cheapest store's list", async () => {
  const { browser, page, errors } = await openBrowser();
  try {
    await signUp(page);
    const costco = (await apiFetch(page, "/api/shopping-lists", { method: "POST", body: { name: "Costco" } })).body;
    const publix = (await apiFetch(page, "/api/shopping-lists", { method: "POST", body: { name: "Publix" } })).body;
    await apiFetch(page, `/api/shopping-lists/${costco.shoppingListId}/items`, { method: "POST", body: { name: "Coffee Beans" } });

    // Favorite the item from its swipe actions, in a new category.
    await page.goto(`${baseUrl}/app/lists/${costco.shoppingListId}`);
    await page.getByText("Coffee Beans").waitFor();
    const sliding = await openSwipe(page, "Coffee Beans", "end");
    await sliding.locator("ion-item-option", { hasText: "Favorite" }).click();
    await page.locator("ion-action-sheet button", { hasText: "New Category…" }).click();
    await page.locator("ion-alert input").fill("coffee");
    await page.locator("ion-alert button", { hasText: "Add" }).click();
    await page.locator("ion-toast").waitFor();
    await page.locator(".favorite-star").waitFor();
    await screenshot(page, "favorites-list-star");

    // The Favorites page groups it under Coffee, sold at Costco.
    await page.goto(`${baseUrl}/app/lists`);
    await page.getByRole("button", { name: "Favorites" }).click();
    await page.waitForURL("**/app/favorites");
    await page.locator(".section-header", { hasText: "Coffee" }).waitFor();
    await page.locator("ion-item", { hasText: "Coffee Beans" }).getByText("Costco").waitFor();

    // Give it a price at Publix.
    await page.locator("ion-item", { hasText: "Coffee Beans" }).first().click();
    await page.locator("ion-modal.show-modal").getByText("Where to Buy").waitFor();
    await page.locator("ion-modal.show-modal ion-item", { hasText: "Add Store" }).click();
    await page.locator("ion-action-sheet button", { hasText: "Publix" }).click();
    await page.locator("ion-alert input").first().fill("15.49");
    await page.locator("ion-alert input").nth(1).fill("12 oz");
    await page.locator("ion-alert button", { hasText: "Save" }).click();
    await page.locator("ion-modal.show-modal").getByText("$15.49").waitFor();
    await screenshot(page, "favorites-editor");
    await page.locator("ion-modal.show-modal ion-button", { hasText: "Save" }).click();
    await page.locator("ion-item", { hasText: "Coffee Beans" }).getByText("Publix $15.49, Costco").waitFor();
    // Until the sheet has slid away, it keeps the focus.
    await page.waitForFunction(() => !document.querySelector("ion-modal.show-modal"));

    // Search finds it by store and category; other words don't.
    const search = page.locator("ion-searchbar input");
    await search.fill("publix coffee");
    await page.locator("ion-item", { hasText: "Coffee Beans" }).waitFor();
    await screenshot(page, "favorites-search");
    await search.fill("sake");
    await page.getByText("No Results").waitFor();
    await search.fill("");
    await screenshot(page, "favorites");

    // Add to List offers Publix (cheapest) first.
    const row = await openSwipe(page, "Coffee Beans", "start");
    await row.locator("ion-item-option", { hasText: "Add" }).click();
    const first = page.locator("ion-action-sheet button").first();
    assert.equal((await first.textContent()).trim(), "Publix · $15.49");
    await screenshot(page, "favorites-add-to-list");
    await first.click();
    await page.locator("ion-toast").waitFor();
    const onPublix = (await apiFetch(page, `/api/shopping-lists/${publix.shoppingListId}/items`)).body;
    assert.deepEqual(onPublix.map((item) => item.itemName), ["Coffee Beans"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("a list adds several favorites at once from its options", async () => {
  const { browser, page, errors } = await openBrowser();
  try {
    await signUp(page);
    const list = (await apiFetch(page, "/api/shopping-lists", { method: "POST", body: { name: "Weekend" } })).body;
    for (const [name, category] of [["Junmai", "Sake"], ["Nigori", "Sake"], ["Espresso", "Coffee"]]) {
      assert.equal((await apiFetch(page, "/api/favorites", { method: "POST", body: { name, category } })).status, 201);
    }

    await page.goto(`${baseUrl}/app/lists/${list.shoppingListId}`);
    await page.getByText("Nothing to Buy").waitFor();
    await page.getByRole("button", { name: "List options" }).click();
    await page.locator("ion-action-sheet button", { hasText: "Add from Favorites" }).click();
    await page.waitForURL("**/app/favorites?list=*");
    await page.locator("ion-item", { hasText: "Junmai" }).first().click();
    await page.locator("ion-item", { hasText: "Espresso" }).first().click();
    await screenshot(page, "favorites-picking");
    await page.locator("ion-button", { hasText: "Add 2 to List" }).click();
    await page.waitForURL(`**/app/lists/${list.shoppingListId}`);
    // The list's rows (Ionic keeps the Favorites page in the DOM a while after going back), starred.
    for (const name of ["Junmai", "Espresso"]) {
      await page.locator("ion-item", { has: page.locator("button.check"), hasText: name }).locator(".favorite-star").waitFor();
    }
    await screenshot(page, "favorites-added-to-list");
    const items = (await apiFetch(page, `/api/shopping-lists/${list.shoppingListId}/items`)).body;
    assert.deepEqual(items.map((item) => item.itemName).sort(), ["Espresso", "Junmai"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
