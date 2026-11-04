import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [vue()],
  build: { rolldownOptions: { input: ["index.html", "app/index.html"] } },
  server: { host: "127.0.0.1", port: 9123, strictPort: true }
})
