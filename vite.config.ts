import { defineConfig, Plugin } from "vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Plugin to redirect .css imports to .css.js in webawesome package
function webawesomeCssPlugin(): Plugin {
  return {
    name: "webawesome-css",
    enforce: "pre",
    resolveId(source, importer) {
      // Only handle .css imports from webawesome package
      if (importer?.includes("@home-assistant/webawesome") && source.endsWith(".css")) {
        // Resolve the full path and add .js extension
        const resolvedPath = path.resolve(path.dirname(importer), source) + ".js";
        return resolvedPath;
      }
      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,

  plugins: [webawesomeCssPlugin()],

  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Don't pre-bundle webawesome - let our plugin handle CSS resolution
  optimizeDeps: {
    exclude: ["@home-assistant/webawesome"],
  },
}));
