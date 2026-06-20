import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_TARGET; // e.g. https://xxx.lambda-url...

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: apiTarget
        ? {
            "/api": {
              target: apiTarget,
              changeOrigin: true,
              secure: true
            }
          }
        : undefined
    },
    build: {
      outDir: "dist",
      sourcemap: true
    }
  };
});
