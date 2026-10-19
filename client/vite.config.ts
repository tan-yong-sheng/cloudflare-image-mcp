import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The build output is deployed as Workers Static Assets (see
// workers/wrangler.toml.example and .github/workflows/deploy-workers.yml).
// The Worker owns every API route and hands the document and its assets to
// the asset binding, so the built document must sit at the root of the
// assets directory for "/" to resolve to it.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "assets",
    // The asset binding serves dist/ by path, so a request for
    // /assets/<file> resolves to dist/assets/<file>.
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
