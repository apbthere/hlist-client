# HList client

The iOS-style mobile client for HList: Ionic 9 (always iOS mode) + Vue 3 + TypeScript + Vite, installed on
iPhone/iPad as a home-screen web app (no App Store). The server (`../server`, see its `CLAUDE.md`) serves the build
under `/app/` on the same origin as `/api`. `README.md` covers setup and installing on a device.

## Commands

```sh
npm test            # Vitest (jsdom), about 60 tests
npm run typecheck   # vue-tsc
npm run build       # type-check + build to dist/ (the server serves dist/ directly; no restart needed)
npm run dev         # http://localhost:5173/app/, proxies /api to localhost:8080 (HLIST_SERVER to change)
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests and `vite build`. There is no ESLint config.

## Layout

- `src/api/`: `http.ts` (fetch wrapper: CSRF header from the `XSRF-TOKEN` cookie, 401 → sign-in, `raw` blob
  bodies, `X-HList-Client` id for live updates), `hlist.ts` (typed endpoints), `types.ts`.
- `src/router.ts`: `/login`, `/lists`, `/lists/:id`, `/add`. A guard requires sign-in. `/add` survives a sign-in
  through `sessionStorage` (`pathAfterSignIn`).
- `src/session.ts`: `signIn`, `passkeySignIn`, `signOut`.
- `src/views/`: `ListsPage`, `ListItemsPage` (department groups, live updates, photo viewer),
  `AddFromPage` (/add: see "Adding from store websites"), `LoginPage`.
- `src/components/ItemEditorSheet.vue`: the New/Edit Item sheet, the most involved component.
  - Name field: smart parsing ("Milk by Horizon in Dairy", asking before creating a brand or department from a
    one-part pattern), sounds-alike suggestions and fill-from-history.
  - Pasting a product link or picture into the name fills in name, brand and photo.
  - Photo section: Take Photo, Choose from Photos and Paste Image, plus Open Food Facts suggestions.
  - Duplicate handling, and the `fromPage` prefill used by /add.
- `src/lib/`:
  - `items.ts`: patterns, soundex matching (`findCatalogMatch`), grouping.
  - `photos.ts`: upload preparation (canvas, HEIC → JPEG, 1600 px), clipboard and paste parsing, prefetching.
  - `addFromPage.ts`: the store-page script and /add logic.
  - `live.ts`: SSE client. `listCache.ts`. `stores.ts`: store icons. `feedback.ts`: alerts and prompts.
  - `passkeys.ts`: Face ID / Touch ID sign-in (WebAuthn JSON ↔ `navigator.credentials`). Shown only where
    `passkeysAvailable()` (secure context and an origin the server lists). The sign-in page offers passkeys in
    the username field's AutoFill (`autocomplete="username webauthn"`, a waiting conditional request) and with a
    button, and after a password sign-in offers once to save one. The Account sheet lists, adds and removes them.
    One request at a time: starting one aborts the previous (a pending AutoFill request blocks the browser).
- `src/theme/variables.css`: iOS grouped colours, light and dark, and the green tint. Sheets get their background
  from `ion-modal` rules; the light rule must come before the dark-mode block.
- `vite.config.ts`: PWA (Workbox). Runtime caches: store icons (stale-while-revalidate) and `item-photos`
  (cache-first, a year). Sign-out clears `item-photos`.

## Conventions

- Match iOS: inset grouped lists, `.section-header` / `.section-footer`, sentence-case labels, action sheets for
  choices, `alertController` (via `lib/feedback.ts`) for errors. Error messages come from the server's
  `{message}` and are shown as is, so write server messages for users.
- Keep taps to a minimum. The owner rejects flows with extra steps. Prefer filling things in automatically (paste
  into the name, suggestions under Photo) over extra menus.
- Tests sit next to their subject in `tests/*.test.ts`. API calls are tested by stubbing `fetch`.

## Adding from store websites (`lib/addFromPage.ts`, `views/AddFromPage.vue`)

publix.com blocks the server (Akamai), so the user's own browser reads the page.

- **Script:** `readProductPage` runs on the store's page, either as the Safari bookmark (`bookmarklet()`) or in
  an iOS Shortcut's "Run JavaScript on Web Page" (`shortcutScript()`, which ends with `completion(url)`). It
  only collects `name` (the h1, else og:title), `photo` (og:image), `link`, and the raw text `above` and `below`
  the h1. It opens `/app/add?...`.
- **Interpretation:** what that text means is decided in `productFromQuery`. On Publix: above = store section
  (becomes the department, matched exactly, not by sound), below = size (becomes notes), and a "Publix ..." name
  means brand Publix.
- **Change the interpretation, not the script.** Users have installed the script, so changes to it need a manual
  reinstall. Change `productFromQuery` instead.
- **Self-contained script.** `readProductPage` is serialised with `Function.prototype.toString()`. It must not
  use imports, helpers or anything outside its own body. `tests/addFromPage.test.ts` runs the real script on mock
  pages.
- **The /add page:**
  - It picks the newest open list whose store matches the link's site (`defaultList`), otherwise it asks.
  - It hands the product to `ListItemsPage` (`setPendingProduct`), which opens the editor with `fromPage`.
  - Without parameters, /add is the setup page. The desktop header and the Account sheet link to it.

## Gotchas

- **`@click="fn"` passes the click event** as the first argument. Write `@click="add()"` when `add` takes optional
  parameters.
- **`<script setup>` runs top to bottom.** A `computed` read by `watch(..., { immediate: true })` must not use a
  `const` declared further down (temporal dead zone at runtime; vue-tsc doesn't catch it).
- **Plain-HTTP LAN addresses aren't secure contexts.** For example http://192.168.0.24:8080 has no
  `navigator.clipboard` and no service worker. Paste Image then falls back to a paste box (`contenteditable`,
  `inputmode="none"`). Safari pastes a copied web image as its address or HTML, not a file, so paste handling also
  accepts links (`linkFromPaste`).
- **Paste on `ion-input`.** The native input is in light DOM, so `@paste` on `ion-input` receives it.
- **Updates on the iPad.** The home-screen app keeps the old build until relaunched (close it fully), because the
  service worker updates in the background.

## Testing in a real browser engine

- Playwright's WebKit (`playwright-core`) is the closest to Safari. Drive it against a throwaway server on port
  18080 with its own `H2_DB_PATH`, so the real local data stays clean. Create a user and log in via `fetch` in
  `page.evaluate`. Ionic overlays are `ion-modal.show-modal`, `ion-action-sheet button` and `ion-alert`.
- Passkeys can't be tested in WebKit (no virtual authenticator). Use Playwright's Chromium with the CDP
  `WebAuthn.addVirtualAuthenticator` (`internal`, resident key, user verified, `automaticPresenceSimulation`).
  It answers the AutoFill request at once, so the sign-in page signs in by itself; to test the button, make
  `PublicKeyCredential.isConditionalMediationAvailable` return false in an init script.
- iOS simulators: Xcode 27 has no Simulator.app; the simulators run in **DeviceHub**. `xcrun simctl` boots them
  and takes screenshots. `safaridriver -p 4444` with `safari:useSimulator` drives iOS Safari for navigation,
  scripts and screenshots. Its synthetic taps and typing don't reach Ionic controls there, so click and fill
  through scripts. Start `safaridriver` with `-p`, and stop it afterwards: without `-p` it can sit on port 8080.
