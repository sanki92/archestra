import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "src/app"),
  plugins: [viteSingleFile()],
  build: {
    minify: true,
    cssMinify: true,
    outDir: path.join(root, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.join(root, "src/app/flow-editor.html"),
    },
  },
});
