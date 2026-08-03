import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // DB tests bootstrap a fresh in-process Postgres (PGlite) and run every
    // migration in beforeEach; under parallel load that can exceed the default
    // 10s hook timeout, so give setup/teardown room.
    hookTimeout: 30000,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Playwright specs live in ./e2e and are run by Playwright, not Vitest.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
