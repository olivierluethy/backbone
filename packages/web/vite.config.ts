import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5410,
    proxy: { "/api": "http://localhost:5411" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
