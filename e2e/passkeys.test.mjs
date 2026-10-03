// Passkeys in Chromium with a simulated Face ID (WebKit can't simulate one): saving one after a password
// sign-in, then signing in with it through AutoFill and with the button.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { addPasskeyAuthenticator, apiFetch, baseUrl, openBrowser, screenshot, startServer } from "./harness.mjs";

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

const password = "e2e-password";

async function createUser(page) {
  const username = `e2e${Date.now()}`;
  await page.goto(`${baseUrl}/app/login`);
  const created = await apiFetch(page, "/api/users", { method: "POST", body: { username, password } });
  assert.equal(created.status, 201);
  return username;
}

async function signedInAs(page) {
  return (await apiFetch(page, "/api/users/me")).body.username;
}

// Every browser opened here; closed after each test even when it fails (an open one keeps node running).
const browsers = [];
afterEach(async () => { await Promise.all(browsers.splice(0).map((browser) => browser.close())); });

async function device(options) {
  const opened = await openBrowser({ engine: "chromium", ...options });
  browsers.push(opened.browser);
  return opened;
}

test("saves a passkey after a password sign-in and signs in with it", async () => {
  // The iPad: signs in with the password and accepts the offer.
  const iPad = await device();
  const faceId = await addPasskeyAuthenticator(iPad.context, iPad.page, { autofill: false });
  const username = await createUser(iPad.page);
  await iPad.page.reload();
  await iPad.page.fill("#username", username);
  await iPad.page.fill("#password", password);
  await iPad.page.locator("form .primary-action").click();
  await iPad.page.locator("ion-alert").getByText("Save Passkey").click();
  await iPad.page.waitForURL("**/app/lists");
  const passkeys = await faceId.credentials();
  assert.equal(passkeys.length, 1);
  const listed = await apiFetch(iPad.page, "/api/users/me/passkeys");
  assert.equal(listed.body.length, 1);
  await screenshot(iPad.page, "passkeys-saved");
  assert.deepEqual(iPad.errors, []);

  // Another device with the synced passkey: AutoFill signs in as soon as the page opens.
  const mac = await device();
  await (await addPasskeyAuthenticator(mac.context, mac.page)).add(passkeys);
  await mac.page.goto(`${baseUrl}/app/login`);
  await mac.page.waitForURL("**/app/lists");
  assert.equal(await signedInAs(mac.page), username);
  assert.ok((await mac.context.cookies()).some((cookie) => cookie.name === "remember-me"), "kept signed in");
  assert.deepEqual(mac.errors, []);

  // Without AutoFill, the button does it.
  const other = await device();
  await (await addPasskeyAuthenticator(other.context, other.page, { autofill: false })).add(passkeys);
  await other.page.goto(`${baseUrl}/app/login`);
  await other.page.getByText("Sign In with Passkey").click();
  await other.page.waitForURL("**/app/lists");
  assert.equal(await signedInAs(other.page), username);
  assert.deepEqual(other.errors, []);
});
