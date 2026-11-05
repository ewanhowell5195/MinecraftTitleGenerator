import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vite"

const presetPages = {
  name: "preset-pages",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (/^\/app\/presets(\/\d+)?\/?(\?|$)/.test(request.url)) request.url = "/app/index.html"
      next()
    })
  }
}

export default defineConfig({
  plugins: [vue(), presetPages],
  build: { rolldownOptions: { input: ["index.html", "app/index.html"] } },
  server: { host: "127.0.0.1", port: 9123, strictPort: true, proxy: { "/api": { target: "https://mctitlegenerator.com", changeOrigin: true } } }
})
