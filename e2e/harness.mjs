// Browser tests against a real HList server. Each test file starts a throwaway server on port 18080 with its own
// database in a temporary folder, so local data stays untouched; the server serves this repo's dist/ (build it
// first: npm run e2e does). See CLAUDE.md "Testing in a real browser engine".
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright-core";

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = resolve(clientDir, "../server");
const port = Number(process.env.HLIST_E2E_PORT ?? 18080);
export const baseUrl = `http://localhost:${port}`;
/** Screenshots land here (git-ignored). */
export const outputDir = join(clientDir, "e2e/output");

/** An iPad in portrait, like the owner's. */
export const iPad = { viewport: { width: 820, height: 1180 }, hasTouch: true };
/** Safari on a Mac, for the desktop pages. */
export const mac = { viewport: { width: 1280, height: 800 } };

async function serverUp() {
  try {
    return (await fetch(`${baseUrl}/api/version`)).ok;
  } catch {
    return false;
  }
}

/**
 * Starts the packaged server (../server/target, built with ./mvnw -q -DskipTests package) on a fresh database.
 * Resolves to { stop } once it answers.
 */
export async function startServer() {
  if (await serverUp()) {
    throw new Error(`Something is already running on port ${port}. Stop it (or set HLIST_E2E_PORT) and retry.`);
  }
  const jar = process.env.HLIST_SERVER_JAR ?? join(serverDir, "target/server-0.0.1-SNAPSHOT.jar");
  if (!existsSync(jar)) throw new Error(`No server jar at ${jar}. Run ./mvnw -q -DskipTests package in ../server.`);
  if (statSync(join(serverDir, "src")).mtimeMs > statSync(jar).mtimeMs) {
    console.warn("warning: ../server/src changed after the jar was built; run ./mvnw -q -DskipTests package");
  }
  if (!existsSync(join(clientDir, "dist/index.html"))) throw new Error("No dist/. Run npm run build first.");

  const dataDir = mkdtempSync(join(tmpdir(), "hlist-e2e-"));
  const log = [];
  const server = spawn("java", [
    "-jar", jar,
    `--server.port=${port}`,
    `--hlist.client.location=file:${join(clientDir, "dist")}/`,
    // A stopped test server needn't wait for open connections (the real one waits up to 30 s).
    "--server.shutdown=immediate",
  ], { env: { ...process.env, H2_DB_PATH: join(dataDir, "server") }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (chunk) => log.push(chunk));
  server.stderr.on("data", (chunk) => log.push(chunk));

  const started = Date.now();
  while (!await serverUp()) {
    if (server.exitCode !== null || Date.now() - started > 60_000) {
      server.kill();
      throw new Error(`The server didn't start:\n${Buffer.concat(log).toString().slice(-3000)}`);
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  return {
    /** The server's output so far, for diagnosing a failure. */
    log: () => Buffer.concat(log).toString(),
    async stop() {
      const exited = new Promise((done) => server.once("exit", done));
      server.kill();
      await exited;
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Opens a page in WebKit (closest to Safari; the default) or Chromium (needed for passkeys, see
 * addPasskeyAuthenticator). Page errors are collected in `errors`; assert it's empty at the end.
 */
export async function openBrowser({ engine = "webkit", device = iPad } = {}) {
  const browser = await (engine === "chromium" ? chromium : webkit).launch();
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { browser, context, page, errors };
}

/** Sends a request from the page, with the CSRF token the server expects; resolves to { status, body }. */
export function apiFetch(page, path, { method = "GET", body } = {}) {
  return page.evaluate(async ({ path, method, body }) => {
    const cookie = () => document.cookie.split("; ").find((entry) => entry.startsWith("XSRF-TOKEN="));
    if (!cookie()) await fetch("/api/auth/csrf");
    const headers = { "X-XSRF-TOKEN": decodeURIComponent(cookie()?.slice(11) ?? "") };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let parsed = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, body: parsed };
  }, { path, method, body });
}

/**
 * Creates a user and signs the page in (session plus remember-me cookie). The page must already be on the
 * server's origin. Resolves to { username, password }.
 */
export async function signUp(page, username = `e2e${Date.now()}`, password = "e2e-password") {
  if (!page.url().startsWith(baseUrl)) await page.goto(`${baseUrl}/api/version`);
  const created = await apiFetch(page, "/api/users", { method: "POST", body: { username, password } });
  if (created.status !== 201) throw new Error(`Creating ${username} failed: ${created.status} ${JSON.stringify(created.body)}`);
  const signedIn = await page.evaluate(async ({ username, password }) => {
    const token = decodeURIComponent(document.cookie.split("; ").find((entry) => entry.startsWith("XSRF-TOKEN=")).slice(11));
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "X-XSRF-TOKEN": token },
      body: new URLSearchParams({ username, password, "remember-me": "true" }),
    });
    return response.status;
  }, { username, password });
  if (signedIn !== 204) throw new Error(`Signing in as ${username} failed: ${signedIn}`);
  return { username, password };
}

/**
 * Chromium only: a built-in "Face ID" that creates and uses passkeys without asking. It also answers the
 * sign-in page's AutoFill request at once; to test the passkey button instead, pass { autofill: false }.
 */
export async function addPasskeyAuthenticator(context, page, { autofill = true } = {}) {
  if (!autofill) {
    await context.addInitScript(() => { PublicKeyCredential.isConditionalMediationAvailable = async () => false; });
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2", transport: "internal", hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });
  return {
    /** The passkeys saved on this "device" so far. */
    credentials: async () => (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials,
    /** Puts passkeys from another device on this one, like iCloud Keychain syncing them. */
    add: async (credentials) => {
      for (const credential of credentials) await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
    },
  };
}

/** Saves a screenshot as e2e/output/<name>.png and returns its path (open it to check the layout). */
export async function screenshot(page, name) {
  mkdirSync(outputDir, { recursive: true });
  const path = join(outputDir, `${name}.png`);
  await page.screenshot({ path });
  return path;
}
