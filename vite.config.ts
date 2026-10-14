import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES === "1" ? "/Blinkling/" : "./",
  server: {
    watch: {
      usePolling: process.env.BLINKLING_POLL_WATCH === "1",
      interval: 1000,
    },
  },
  build: { outDir: "dist", sourcemap: false },
});
