import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [
    vue(),
    ...(mode === "web"
      ? [
          VitePWA({
            registerType: "prompt",
            includeAssets: ["icon.svg"],
            manifest: {
              name: "ImageToolBox",
              short_name: "ImageToolBox",
              description: "Local-first image editor",
              display: "standalone",
              background_color: "#f2f4f8",
              theme_color: "#3157f5",
              icons: [
                {
                  src: "icon.svg",
                  sizes: "any",
                  type: "image/svg+xml",
                  purpose: "any maskable",
                },
              ],
            },
            workbox: {
              globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
              cleanupOutdatedCaches: true,
              maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
            },
          }),
        ]
      : []),
  ],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("konva")) return "canvas";
          if (id.includes("@zip.js") || id.includes("/idb/")) return "storage";
          if (
            id.includes("/vue/") ||
            id.includes("pinia") ||
            id.includes("vue-i18n")
          ) {
            return "vue";
          }
          return "vendor";
        },
      },
    },
  },
}));
