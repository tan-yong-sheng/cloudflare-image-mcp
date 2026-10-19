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
  // No public directory: Vite would copy it to the root of the build
  // output, and the Worker only serves /assets/ before the auth gate.
  // A file outside that prefix would answer 401, so the build may not
  // produce one. A file the client needs belongs in src/ and is
  // imported, which puts it in /assets/ with a hashed name.
  publicDir: false,
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
