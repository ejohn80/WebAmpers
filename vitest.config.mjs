import {defineConfig} from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "src/tests/setup.js",
    globals: true,
    css: true,
    exclude: ["node_modules", "dist", ".git", ".cache"],
  },
});
