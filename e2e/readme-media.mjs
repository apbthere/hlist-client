// Makes the README's screenshots and demo GIF (the server repository's docs/images/), in WebKit at iPhone size, from a throwaway
// server with sample lists. Product photos come from Open Food Facts and store icons from the stores' sites, so it
// needs the internet. Run with: npm run readme-media (builds dist/ first; the server jar must be built too).
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import gifenc from "gifenc";
import { apiFetch, baseUrl, openBrowser, serverDir, signUp, startServer } from "./harness.mjs";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const imagesDir = join(serverDir, "docs/images");
const iPhone = {
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: "light",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    + "Version/18.0 Mobile/15E148 Safari/604.1",
};

const departments = ["Produce", "Dairy & Eggs", "Bakery", "Meat & Seafood", "Pantry", "Frozen", "Household"];

// [name, brand, department, quantity, comment, checked off]
const lists = [
  ["Costco, Oct 4", true, [
    ["Oat Milk", "Oatly", "Dairy & Eggs", 2, "Full fat"],
    ["Paper Towels", "Bounty", "Household", 1],
    ["Blueberries", null, "Produce", 1],
    ["Salmon Fillets", "Kirkland Signature", "Meat & Seafood", 1],
  ]],
  ["Target", false, [
    ["Laundry Detergent", "Tide", "Household", 1],
    ["Sparkling Water", "LaCroix", "Pantry", 2, "Lime"],
  ]],
  ["Publix Weekly", false, [
    ["Bananas", null, "Produce", 6],
    ["Sourdough Bread", null, "Bakery", 1],
    ["Orange Juice", "Tropicana", "Dairy & Eggs", 1, "No pulp"],
    ["Ground Coffee", "Starbucks", "Pantry", 1],
  ]],
  ["Costco Run", false, [
    ["Strawberries", null, "Produce", 1],
    ["Avocados", null, "Produce", 1, "Bag of 5"],
    ["Greek Yogurt", "Chobani", "Dairy & Eggs", 2, "Plain, 32 oz"],
    ["Cheddar Cheese", "Tillamook", "Dairy & Eggs", 1],
    ["Peanut Butter", "Jif", "Pantry", 1, "Creamy"],
    ["Rotisserie Chicken", null, "Meat & Seafood", 1],
    ["Eggs", null, "Dairy & Eggs", 2, "", true],
  ]],
];

async function seed(page) {
  const call = async (path, method, body, expected) => {
    const response = await apiFetch(page, path, { method, body });
    if (expected && response.status !== expected) {
      throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body;
  };
  const departmentIds = {};
  for (const name of departments) {
    departmentIds[name] = (await call("/api/departments", "POST", { name }, 201)).departmentId;
  }
  const brandIds = {};
  const ids = {};
  for (const [listName, completed, items] of lists) {
    const list = await call("/api/shopping-lists", "POST", { name: listName }, 201);
    ids[listName] = list.shoppingListId;
    for (const [name, brand, department, quantity, comment, checked] of items) {
      if (brand && !brandIds[brand]) brandIds[brand] = (await call("/api/brands", "POST", { name: brand }, 201)).brandId;
      const item = await call(`/api/shopping-lists/${list.shoppingListId}/items`, "POST", {
        name, quantity, departmentId: departmentIds[department], brandId: brandIds[brand] ?? null, comment,
      }, 201);
      ids[name] = item.itemId;
      await attachPhoto(page, call, item.itemId, name, brand);
      if (checked) {
        await call(`/api/shopping-lists/${list.shoppingListId}/items/${item.itemId}/completion`, "PATCH",
          { completed: true });
      }
    }
    if (completed) await call(`/api/shopping-lists/${list.shoppingListId}/completion`, "PATCH", { completed: true });
  }
  return ids;
}

/**
 * The first Open Food Facts photo for the item. Open Food Facts is sometimes busy, so it tries a few times; the demo
 * GIF's oat milk must have one.
 */
async function attachPhoto(page, call, itemId, name, brand) {
  const query = new URLSearchParams({ name, ...(brand ? { brand } : {}) });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await page.waitForTimeout(3000);
    const suggestions = await call(`/api/photos/suggestions?${query}`, "GET");
    for (const suggestion of Array.isArray(suggestions) ? suggestions.slice(0, 3) : []) {
      const photo = await apiFetch(page, "/api/photos/import", { method: "POST", body: { url: suggestion.imageUrl } });
      if (photo.status !== 201) continue;
      await call(`/api/items/${itemId}/photo`, "PUT", { photoId: photo.body.photoId }, 204);
      return;
    }
  }
  if (name === "Oat Milk") throw new Error("No photo for Oat Milk (Open Food Facts busy?); try again later.");
  console.warn(`no photo for ${name}`);
}

/** Waits until the page's images have loaded (product photos, store icons). */
async function imagesLoaded(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.waitForTimeout(600); // sheet and list animations
}

async function shoot(page, name) {
  const path = join(imagesDir, `${name}.png`);
  await page.screenshot({ path });
  console.log(`${path} (${Math.round(statSync(path).size / 1024)} KB)`);
}

const server = await startServer();
try {
  mkdirSync(imagesDir, { recursive: true });
  const { browser, context, page, errors } = await openBrowser({ device: iPhone });
  await signUp(page, "alex", "demo-password");
  const ids = await seed(page);
  const token = (await apiFetch(page, "/api/users/me/access-tokens", { method: "POST", body: { label: "Claude" } }))
    .body.token;

  await page.goto(`${baseUrl}/app/lists`);
  await page.getByText("Costco Run").waitFor();
  await imagesLoaded(page);
  await shoot(page, "lists");

  await page.getByText("Costco Run").click();
  await page.getByText("Greek Yogurt").waitFor();
  await imagesLoaded(page);
  await shoot(page, "list-items");

  await page.getByText("Greek Yogurt").click();
  await page.getByText("Plain, 32 oz").or(page.locator("input[value='Plain, 32 oz'], textarea")).first().waitFor();
  await imagesLoaded(page);
  await shoot(page, "item-editor");

  await page.goto(`${baseUrl}/app/lists`);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByText("Connect an Assistant").waitFor();
  await page.getByText("AI Assistants").scrollIntoViewIfNeeded();
  await imagesLoaded(page);
  await shoot(page, "account-assistant");

  await recordDemo(browser, await context.storageState(), ids, token);
  await browser.close();
  if (errors.length) console.warn("page errors:", errors);
} finally {
  await server.stop();
}

/**
 * The GIF: a terminal on the left makes the MCP calls Claude makes for "add the usual oat milk to my Costco list"
 * (for real, against the server), and the app on the right shows the item arrive over server-sent events.
 */
async function recordDemo(browser, storageState, ids, token) {
  const context = await browser.newContext({ viewport: { width: 880, height: 600 }, colorScheme: "light", storageState });
  const page = await context.newPage();
  await page.route(`${baseUrl}/readme-demo`, (route) => route.fulfill({ contentType: "text/html", body: stage(ids, token) }));
  await page.goto(`${baseUrl}/readme-demo`);
  const app = page.frameLocator("iframe");
  await app.getByText("Greek Yogurt").waitFor();
  await imagesLoaded(page);
  await page.waitForTimeout(1500);

  const frames = [];
  let last = Date.now();
  await page.evaluate(() => { window.play(); }); // not awaited: frames are taken while it plays
  for (;;) {
    const done = await page.evaluate(() => window.finished);
    const png = await page.screenshot();
    const now = Date.now();
    if (frames.length) frames.at(-1).delay = now - last;
    frames.push({ ...decodePng(png), delay: 100 });
    last = now;
    if (done) break;
  }
  frames.at(-1).delay = 3000;
  await context.close();
  writeGif(frames, join(imagesDir, "demo.gif"));
}

function stage(ids, token) {
  return `<!doctype html><meta charset="utf-8"><title>demo</title>
<style>
  body { margin: 0; height: 100vh; display: flex; gap: 24px; align-items: center; justify-content: center;
    background: #e9ecf1; font: 14px/1.5 -apple-system, system-ui, sans-serif; }
  .terminal { width: 430px; height: 520px; border-radius: 10px; background: #1e1f24; color: #e6e6e6;
    box-shadow: 0 10px 30px rgba(0,0,0,.2); overflow: hidden; display: flex; flex-direction: column; }
  .bar { height: 28px; background: #2c2d33; display: flex; align-items: center; gap: 7px; padding: 0 12px; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #ff5f57; }
  .bar i:nth-child(2) { background: #febc2e; } .bar i:nth-child(3) { background: #28c840; }
  .bar span { margin-left: auto; margin-right: auto; color: #9a9ba3; font-size: 12px; }
  pre { margin: 0; padding: 14px 16px; font: 13px/1.55 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
  .you { color: #fff; } .dim { color: #8b8c94; } .tool { color: #7cc7ff; } .ok { color: #8ee28e; } .text { color: #f2f2f2; }
  .phone { width: 375px; height: 560px; border-radius: 28px; border: 8px solid #1e1f24; overflow: hidden;
    background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.2); }
  iframe { width: 100%; height: 100%; border: 0; }
</style>
<div class="terminal"><div class="bar"><i></i><i></i><i></i><span>claude</span></div><pre id="out"></pre></div>
<div class="phone"><iframe src="/app/lists/${ids["Costco Run"]}"></iframe></div>
<script>
  const out = document.getElementById("out");
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const line = (text, cls) => { const span = document.createElement("span"); span.className = cls; span.textContent = text + "\\n"; out.append(span); return span; };
  async function mcp(name, args) {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer ${token}" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }),
    });
    const reply = await response.json();
    if (reply.error || reply.result.isError) throw new Error(JSON.stringify(reply));
    return reply.result.content[0].text;
  }
  async function type(text) {
    const span = line("", "you");
    for (const char of text) { span.textContent += char; await sleep(45); }
    span.textContent += "\\n";
  }
  window.finished = false;
  window.play = async () => {
    await type("> Add the usual oat milk to my Costco list");
    line("");
    await sleep(700);
    line("● hlist - list_shopping_lists (search: \\"costco\\")", "tool");
    await mcp("list_shopping_lists", { search: "costco" });
    await sleep(600);
    line("  ⎿ Costco Run", "dim");
    line("");
    await sleep(500);
    line("● hlist - search_item_history (query: \\"oat milk\\", store: \\"costco\\")", "tool");
    await mcp("search_item_history", { query: "oat milk", store: "costco" });
    await sleep(700);
    line("  ⎿ Oat Milk · Oatly · Dairy & Eggs · ×2, Full fat", "dim");
    line("");
    await sleep(500);
    line("● hlist - add_item_to_list (listId: ${ids["Costco Run"]}, fromItemId: ${ids["Oat Milk"]})", "tool");
    await mcp("add_item_to_list", { listId: ${ids["Costco Run"]}, fromItemId: ${ids["Oat Milk"]} });
    await sleep(500);
    line("  ⎿ Added Oat Milk to Costco Run", "ok");
    line("");
    await sleep(900);
    line("Added Oat Milk (Oatly, ×2, full fat) to your Costco Run list: the same one you bought on Oct 4, photo included.", "text");
    await sleep(2500);
    window.finished = true;
  };
</script>`;
}

/** Decodes the 8-bit, non-interlaced RGB(A) PNGs Playwright writes into RGBA pixels. */
function decodePng(buffer) {
  let offset = 8;
  let width, height, channels;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = { 2: 3, 6: 4 }[chunk[9]];
      if (chunk[8] !== 8 || !channels || chunk[12] !== 0) throw new Error("unsupported PNG");
    } else if (type === "IDAT") {
      data.push(chunk);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const line = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (row[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      pixels[target] = line[x * channels];
      pixels[target + 1] = line[x * channels + 1];
      pixels[target + 2] = line[x * channels + 2];
      pixels[target + 3] = 255;
    }
    previous = line;
  }
  return { width, height, pixels };
}

/**
 * One palette for the whole GIF (from the first and last frames), with index 255 kept for "unchanged", so each
 * frame after the first only stores the pixels that changed.
 */
function writeGif(frames, path) {
  const { width, height } = frames[0];
  const sample = new Uint8Array(width * height * 8);
  sample.set(frames[0].pixels);
  sample.set(frames.at(-1).pixels, width * height * 4);
  const palette = quantize(sample, 255);
  while (palette.length < 255) palette.push([0, 0, 0]);
  palette.push([0, 0, 0]);
  const gif = GIFEncoder();
  let previous = null;
  for (const [index, frame] of frames.entries()) {
    const indexed = applyPalette(frame.pixels, palette.slice(0, 255));
    const output = previous ? indexed.map((value, i) => (value === previous[i] ? 255 : value)) : indexed;
    gif.writeFrame(output, width, height, {
      palette, delay: frame.delay, transparent: index > 0, transparentIndex: 255, dispose: 1, repeat: 0,
    });
    previous = indexed;
  }
  gif.finish();
  writeFileSync(path, gif.bytes());
  console.log(`${path} (${frames.length} frames, ${Math.round(statSync(path).size / 1024)} KB)`);
}
