import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The frontend runs on 5173. Calls to /api are proxied to the
// backend on 8787, which is the only place the API key lives.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
