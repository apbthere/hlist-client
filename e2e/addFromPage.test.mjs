// Adding a product from a store's page (/add) in WebKit on an iPad.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { apiFetch, baseUrl, openBrowser, screenshot, signUp, startServer } from "./harness.mjs";

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

const product = new URLSearchParams({
  name: "Mission Super Soft Yellow Super Size Corn Tortillas",
  link: "https://www.publix.com/pd/mission-super-soft-yellow-corn-tortillas/RIO-PCI-123",
  above: "Aisle 3 - International Foods - Mexican",
  below: "10 tortillas [10.84 oz (307 g)]",
});

const listNames = async (page) =>
  (await apiFetch(page, "/api/shopping-lists?page=0&size=100")).body.content.map((list) => list.shoppingListName);

test("without an open list for the store, /add creates one and opens its New Item sheet", async () => {
  const { browser, page, errors } = await openBrowser();
  try {
    await signUp(page);
    await apiFetch(page, "/api/shopping-lists", { method: "POST", body: { name: "Costco run" } });
    await page.goto(`${baseUrl}/app/add?${product}`);
    await page.waitForURL(/\/app\/lists\/\d+$/);
    const sheet = page.locator("ion-modal.show-modal");
    await sheet.waitFor();
    await page.waitForTimeout(800); // the sheet's opening animation
    assert.equal(await sheet.locator("input").first().inputValue(), "Mission Super Soft Yellow Super Size Corn Tortillas");
    await screenshot(page, "add-from-page-new-list");
    assert.deepEqual((await listNames(page)).sort(), ["Costco run", "Publix"]);

    // The next product goes to that list instead of another new one.
    await page.goto(`${baseUrl}/app/add?${product}`);
    await page.waitForURL(/\/app\/lists\/\d+$/);
    assert.deepEqual((await listNames(page)).sort(), ["Costco run", "Publix"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
