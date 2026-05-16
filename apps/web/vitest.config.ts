import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    // mirror the Next.js "@/*" path alias so co-located tests resolve it
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
