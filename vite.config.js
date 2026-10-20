import { defineConfig } from "vite";
export default defineConfig({
  root: "client",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: { canvas: ["fabric"], react: ["react", "react-dom"] },
      },
    },
  },
});
