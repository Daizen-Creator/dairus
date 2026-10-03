import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Testes das telas: rodam no jsdom, com o backend Rust (invoke) simulado.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/testes/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
