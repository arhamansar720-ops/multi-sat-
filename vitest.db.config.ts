import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  loadEnvFile(".env.local");
} catch {
  // Use variables from the environment instead.
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "@content": fileURLToPath(new URL("./content", import.meta.url)) } },
  test: { include: ["tests/integration/**/*.test.ts"], environment: "node", testTimeout: 20_000 },
});
