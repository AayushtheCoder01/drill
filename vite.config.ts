import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // Honour PORT so several dev servers can run side by side without each one
  // needing its own hardcoded flag. Falls back to Vite's default.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
