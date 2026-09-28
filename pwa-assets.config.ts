import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Generates the home-screen, PWA and favicon PNGs in public/ from public/logo.svg: `npm run icons`.
// logo.svg is full-bleed (iOS applies its own rounded mask), so apple and maskable icons need no padding.
export default defineConfig({
  headLinkOptions: { preset: "2023" },
  preset: {
    ...minimal2023Preset,
    apple: { ...minimal2023Preset.apple, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, padding: 0 },
  },
  images: ["public/logo.svg"],
});
