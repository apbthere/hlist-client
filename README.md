# HList client

An iOS-style mobile client for the [HList server](../server), built with Ionic 9 (always in iOS mode),
Vue 3, TypeScript and Vite. It installs on iPhone and iPad as a home-screen web app, so no App Store is
involved.

## How it fits with the server

The server serves this app's build output under `/app/`, on the same origin as `/api`. The session,
remember-me and CSRF cookies therefore work without any CORS setup.

- By default the server reads the build from `../hlist-client/dist/`, relative to the server's working
  directory. Set `hlist.client.location` (e.g. `file:/opt/hlist/client/`) to serve it from elsewhere.
- Client-side routes such as `/app/lists/12` fall back to `index.html`. Hashed files in `/app/assets/`
  are cached for a year.

## Development

```sh
npm install
npm run dev        # http://localhost:5173/app/, proxies /api to http://localhost:8080
HLIST_SERVER=http://localhost:18080 npm run dev   # proxy to a different server
```

Run the Spring Boot server alongside it. The dev server also listens on your LAN address, so you can
open it from a phone on the same Wi-Fi network.

```sh
npm test           # unit tests (Vitest)
npm run typecheck  # vue-tsc
npm run build      # type-check and build to dist/
npm run icons      # regenerate PNG icons from public/logo.svg
```

## Docker

The server repository's Dockerfile builds this client into the same image. It is passed in as a
named build context, so keep both repositories side by side (`server/` and `hlist-client/`):

```sh
cd ../server
docker compose up --build                                   # or:
docker build --build-context client=../hlist-client -t hlist .
```

## Installing on iPhone or iPad

1. Build the client (`npm run build`) and start the server.
2. In Safari on the device, open `http://<server-address>:8080/app/`.
3. Tap Share, then **Add to Home Screen**.

The app then opens full screen with its own icon. "Keep Me Signed In" keeps it signed in for 30 days
across launches.

Browsers only run service workers over HTTPS (localhost is the exception). Over plain HTTP on a LAN the
app still works, but it won't cache itself for offline use until the server is behind HTTPS.

## Layout

- `src/api/`: HTTP client (CSRF and 401 handling) and typed server endpoints
- `src/lib/items.ts`: sounds-alike suggestions, the "Milk by Horizon in Dairy" shortcut, and department grouping
- `src/views/`: Login, Lists and List Items screens
- `src/components/`: item row, item editor sheet, account sheet
- `src/theme/variables.css`: iOS grouped colors (light and dark) and the green tint
