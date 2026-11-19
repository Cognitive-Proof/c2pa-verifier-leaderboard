import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const testfiles = resolve(__dirname, "../testfiles");
const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif" };

// Serves ../testfiles at /testfiles in dev and preview, so the viewer can show and download them.
// The published site links to the files on GitHub instead.
function serveTestfiles() {
  const handler = (req, res, next) => {
    const path = resolve(testfiles, "." + decodeURIComponent(req.url.split("?")[0]));
    if (!path.startsWith(testfiles + sep) || !existsSync(path) || !statSync(path).isFile()) return next();
    res.setHeader("Content-Type", types[extname(path).toLowerCase()] ?? "application/octet-stream");
    createReadStream(path).pipe(res);
  };
  return {
    name: "serve-testfiles",
    // Block bodies: a returned function would be run by Vite as a post-middleware hook.
    configureServer(server) {
      server.middlewares.use("/testfiles", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/testfiles", handler);
    },
  };
}

// Relative base so the build works on GitHub Pages under /<repo>/.
export default defineConfig({
  base: "./",
  plugins: [react(), serveTestfiles()],
});
