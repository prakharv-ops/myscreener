import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src/", import.meta.url));

export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: src }] },
  test: {
    include: ["tests/**/*.test.ts"],
    // the app code falls back to mock data when these are unset; tests must never touch the real database
    env: { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" },
  },
});
