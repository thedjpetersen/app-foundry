import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const siteRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  base: process.env.DOCS_BASE_URL ?? "/app-foundry/",
  root: siteRoot,
  plugins: [
    react({
      babel: {
        plugins: [
          [
            "@stylexjs/babel-plugin",
            {
              dev: process.env.NODE_ENV !== "production",
              runtimeInjection: true,
              treeshakeCompensation: true,
              unstable_moduleResolution: {
                rootDir: repoRoot,
                type: "commonJS",
              },
            },
          ],
        ],
      },
    }),
  ],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
