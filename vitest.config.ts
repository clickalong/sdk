import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        settings: {
          // The SDK only injects the external tag; loading widget.js is outside
          // these unit tests. Treat that intentionally-disabled load as success
          // so Happy DOM does not print a misleading DOMException per test.
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
  },
});
