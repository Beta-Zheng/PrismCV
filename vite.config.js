import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 部署到 GitHub Pages 项目页（如 https://<user>.github.io/PrismCV/）时，
// 资源必须挂在子路径下。fork 者若换仓库名，设环境变量 VITE_BASE_PATH 覆盖即可。
const basePath = process.env.VITE_BASE_PATH || "/PrismCV/";

export default defineConfig({
  // 构建产物前缀：本地 dev 用 /，GitHub Pages 用 /PrismCV/（或环境变量覆盖）
  base: process.env.NODE_ENV === "production" ? basePath : "/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
