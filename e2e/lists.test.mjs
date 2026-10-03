// The basics in WebKit on an iPad: signed-out visitors get the sign-in page, and a signed-in user sees their lists.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { apiFetch, baseUrl, openBrowser, screenshot, signUp, startServer } from "./harness.mjs";

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

test("signed out, the app opens on the sign-in page", async () => {
  const { browser, page, errors } = await openBrowser();
  try {
    await page.goto(`${baseUrl}/app/`);
    await page.waitForURL("**/app/login");
    await page.getByText("Keep Me Signed In").waitFor();
    await screenshot(page, "lists-sign-in");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("a signed-in user sees their lists, newest first", async () => {
  const { browser, page, errors } = await openBrowser();
  try {
    await signUp(page);
    for (const name of ["Costco run", "Publix weekly"]) {
      const created = await apiFetch(page, "/api/shopping-lists", { method: "POST", body: { name } });
      assert.equal(created.status, 201);
    }
    await page.goto(`${baseUrl}/app/lists`);
    const newest = page.getByText("Publix weekly");
    await newest.waitFor();
    const costco = await page.getByText("Costco run").boundingBox();
    assert.ok((await newest.boundingBox()).y < costco.y, "the newest list comes first");
    await screenshot(page, "lists");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
