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

test("the Shortcut's script waits for a page that builds itself, and /add asks to try again when it never does", async () => {
  const { browser, page, errors } = await openBrowser();
  try {
    await signUp(page);
    await page.goto(`${baseUrl}/app/add`);
    const script = await page.locator("pre.script").textContent();

    // A store page whose product appears after a moment, as on costco.com's /p/ pages.
    const store = await page.context().newPage();
    await store.goto(`${baseUrl}/app/does-not-matter`);
    await store.setContent("<html><head></head><body><main></main></body></html>");
    const run = (source) => store.evaluate((code) => new Promise((resolve) => {
      new Function("completion", code)(resolve);
    }), source);
    const late = run(script);
    await store.evaluate(() => setTimeout(() => {
      document.querySelector("main").innerHTML = "<div><section><h1>Limes, 3 lbs</h1></section></div>";
    }, 700));
    const address = new URL(await late);
    assert.equal(address.searchParams.get("name"), "Limes, 3 lbs");

    await store.setContent("<html><head></head><body></body></html>");
    const empty = new URL(await run(script));
    assert.equal(empty.searchParams.get("name"), null);

    await page.goto(`${baseUrl}/app/add?link=${encodeURIComponent("https://www.costco.com/p/-/limes-3-lbs/100443126")}`);
    await page.getByText("The page wasn’t ready").waitFor();
    await screenshot(page, "add-from-page-not-ready");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
