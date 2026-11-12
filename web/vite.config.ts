import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the React app runs on :5173 and forwards /api calls to the
// server on :3000. The browser only ever talks to one origin, so cookies work
// the same way as in production and we never need CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
