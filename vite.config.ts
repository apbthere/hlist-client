import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

// The client is served by the HList Spring Boot server under /app/, on the same origin as /api,
// so the session, remember-me and CSRF cookies work without CORS. In development the Vite server
// proxies /api to the Spring server instead.
const apiServer = process.env.HLIST_SERVER ?? "http://localhost:8080";

export default defineConfig({
  base: "/app/",
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "HList",
        short_name: "HList",
        description: "Shopping lists",
        start_url: "/app/",
        scope: "/app/",
        display: "standalone",
        orientation: "any",
        background_color: "#f2f2f7",
        theme_color: "#f2f2f7",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache the app shell only; API calls always go to the network.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/app/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Store icons: shown from the device's cache straight away (also offline), refreshed in the background.
        runtimeCaching: [{
          // Item photos never change, so a cached copy is always right; kept for use in stores with poor signal.
          urlPattern: ({ url }) => url.pathname.startsWith("/api/photos/"),
          handler: "CacheFirst",
          options: {
            cacheName: "item-photos",
            expiration: { maxEntries: 400, maxAgeSeconds: 365 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [200] },
          },
        }, {
          urlPattern: ({ url }) => url.pathname.startsWith("/api/store-icons/"),
          handler: "StaleWhileRevalidate",
          options: {
            cacheName: "store-icons",
            expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [200] },
          },
        }],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      "/api": { target: apiServer },
    },
  },
});
