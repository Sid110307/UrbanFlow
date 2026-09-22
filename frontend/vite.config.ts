import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["cctv/*.jpg"],
      manifest: {
        name: "UrbanFlow",
        short_name: "UrbanFlow",
        start_url: "/",
        display: "standalone",
        background_color: "#f3f2eb",
        theme_color: "#173b36",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/\.netlify\//],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: "CacheFirst",
            options: {
              cacheName: "urbanflow-data",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/cctv\/.*\.jpg$/,
            handler: "CacheFirst",
            options: {
              cacheName: "urbanflow-cctv",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "urbanflow-vector-tiles",
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "urbanflow-raster-tiles",
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
