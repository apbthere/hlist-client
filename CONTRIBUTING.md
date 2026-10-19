# Contributing to the HList client

Thanks for helping. This is the iOS-style mobile client. The server, which also serves this app, is
[hlist-server](https://github.com/apbthere/hlist-server) and has its own
[CONTRIBUTING.md](https://github.com/apbthere/hlist-server/blob/main/CONTRIBUTING.md).

## Setup

You need Node 24, and Java 25 to run the server. Clone both repositories side by side:

```sh
git clone https://github.com/apbthere/hlist-server.git
git clone https://github.com/apbthere/hlist-client.git
cd hlist-client && npm ci
```

For the browser tests, also install WebKit and Chromium (once) and build the server jar:

```sh
npx playwright-core install webkit chromium
(cd ../hlist-server && ./mvnw -q -DskipTests package)
```

## Running it

```sh
(cd ../hlist-server && ./mvnw spring-boot:run)   # in one terminal: http://localhost:8080
npm run dev                                       # in another: http://localhost:5173/app/, proxies /api to it
```

Or run `npm run build`: the server serves `dist/` at http://localhost:8080/app/ with no restart needed.
`npm run dev` also listens on your LAN address, so you can try it on a phone on the same Wi-Fi network.

## Tests

```sh
npm run typecheck   # vue-tsc
npm test            # unit tests (Vitest)
npm run build       # type-check and production build
npm run e2e         # build, then browser tests in e2e/ against a throwaway server (about 15 s)
```

CI runs the type check, unit tests and build on every pull request. It doesn't run `npm run e2e`, so run that
yourself for UI changes. It starts its own server on port 18080 with a temporary database, so your data stays
untouched. If the server isn't at `../hlist-server` or `../server`, set `HLIST_SERVER_DIR`.

- Unit tests go in `tests/<subject>.test.ts`. Test API calls by stubbing `fetch`.
- Browser tests go in `e2e/*.test.mjs` and use `e2e/harness.mjs` (`startServer`, `openBrowser`, `signUp`,
  `apiFetch`, `screenshot`). WebKit, the default engine, is the closest to Safari. Passkeys need Chromium; see
  `e2e/passkeys.test.mjs`.

## Conventions

- **Look like iOS:** inset grouped lists, sentence-case labels, action sheets for choices and alerts for errors
  (`src/lib/feedback.ts`). Ionic always runs in iOS mode.
- **Keep taps to a minimum.** Prefer filling things in automatically over adding steps, menus or prompts.
- **Error messages come from the server** and are shown as is.
- **Don't change the store-page script** (`readProductPage` in `src/lib/addFromPage.ts`). People have installed
  it as a bookmark or Shortcut, so a change means reinstalling it. Change how its results are read
  (`productFromQuery`) instead.
- `CLAUDE.md` describes the code in more detail, including gotchas.

## Pull requests

- Start a branch from `main` for each change, named for what it does, e.g. `fix/photo-paste`,
  `feature/share-list` or `docs/contributing`.
- Write commit subjects as short sentences in the imperative, without a final period ("Add passkey sign-in").
  Use the body to explain why.
- Put `Closes #<issue>` in the description. Refer to a server issue as `apbthere/hlist-server#<issue>`.
- For UI changes, add a screenshot (light mode, iPhone or iPad size) and say which browser you tried.
- If a change needs both repositories, open a pull request in each with the same branch name, and say which one
  to merge first.
- CI must pass before merging.
