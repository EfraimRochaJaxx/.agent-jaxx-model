import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: ".",
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3099",
    },
  },
});
