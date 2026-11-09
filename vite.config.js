import vue from "@vitejs/plugin-vue"
import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "vite"
import { creditsHtml } from "./src/server/credits.js"
import { escaped } from "./src/server/http.js"
import { linkedCode, linkedTitleDetails, presetDetails, shareTags } from "./src/server/presets.js"

const LIVE = "https://mctitlegenerator.com"
const PRESET_PAGE = /^\/app\/presets(?:\/(\d+))?\/?$/
const APP_PAGE = /^\/app\/(index\.html)?$/
const SUBMISSION_PAGE = /^\/submissions\/\d+\/?$/

async function pageDetails(url) {
  const preset = url.pathname.match(PRESET_PAGE)
  if (!preset && !APP_PAGE.test(url.pathname)) return null
  const code = preset?.[1] ? null : linkedCode(url)
  if (code) return linkedTitleDetails(url, code, preset ? "/app/presets" : "/app/")
  if (!preset) return null
  const id = preset[1] ? Number(preset[1]) : null
  const response = id ? await fetch(`${LIVE}/api/presets/${id}`) : null
  if (response && !response.ok && response.status !== 404) throw new Error(`preset ${id} could not be read from ${LIVE}: ${response.status}`)
  return presetDetails(url.origin, response?.ok ? (await response.json()).preset : null, id)
}

function withDetails(html, details) {
  const { title, description, url, canonical = url } = details
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escaped(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, (_, start) => start + escaped(description))
    .replace(/(<link rel="canonical" href=")[^"]*/, (_, start) => start + escaped(canonical))
    .replace("</head>", () => `${shareTags(details)}</head>`)
}

const presetPages = {
  name: "preset-pages",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      try {
        const host = request.headers["x-forwarded-host"]?.split(",")[0] ?? request.headers.host
        const details = await pageDetails(new URL(request.url, `${request.headers["x-forwarded-proto"]?.split(",")[0] ?? "http"}://${host}`))
        if (!details) return next()
        const page = await fs.promises.readFile(path.join(server.config.root, "app/index.html"), "utf8")
        response.setHeader("Content-Type", "text/html; charset=utf-8")
        response.end(withDetails(await server.transformIndexHtml("/app/index.html", page, request.originalUrl), details))
      } catch (err) {
        next(err)
      }
    })
  }
}

function slashFolders(server) {
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url, "http://localhost")
    if (url.pathname.endsWith("/") || !fs.existsSync(path.join(server.config.root, url.pathname, "index.html"))) return next()
    response.statusCode = 308
    response.setHeader("Location", `${url.pathname}/${url.search}`)
    response.end()
  })
}

const folderSlashes = {
  name: "folder-slashes",
  configureServer: slashFolders,
  configurePreviewServer: slashFolders
}

const submissionPages = {
  name: "submission-pages",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (SUBMISSION_PAGE.test(new URL(request.url, "http://localhost").pathname)) request.url = "/submit/"
      next()
    })
  }
}

const creditsPage = {
  name: "credits-page",
  transformIndexHtml: {
    order: "pre",
    handler(html, context) {
      if (context.path !== "/credits/index.html") return html
      return html.replace("<main class=\"credits\"></main>", () => `<main class="credits">${creditsHtml(import.meta.dirname)}</main>`)
    }
  }
}

const sharedFooter = {
  name: "shared-footer",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      if (!html.includes("<footer class=\"footer\"></footer>")) return html
      const footer = fs.readFileSync(path.join(import.meta.dirname, "src/home/footer.html"), "utf8").trim().replace("%YEAR%", new Date().getFullYear())
      return html.replace("<footer class=\"footer\"></footer>", () => footer)
    }
  }
}

function allowCookiesOverHttp(proxy) {
  proxy.on("proxyRes", response => {
    const cookies = response.headers["set-cookie"]
    if (cookies) response.headers["set-cookie"] = cookies.map(cookie => cookie.replace(/;\s*Secure/i, ""))
  })
}

export default defineConfig({
  plugins: [vue(), submissionPages, folderSlashes, presetPages, creditsPage, sharedFooter],
  build: { rolldownOptions: { input: ["index.html", "app/index.html", "font-editor/index.html", "credits/index.html", "submit/index.html", "account/index.html", "terms/index.html", "privacy/index.html"] } },
  server: { host: "127.0.0.1", port: 9123, strictPort: true, proxy: { "/api": { target: LIVE, changeOrigin: true, configure: allowCookiesOverHttp } } }
})
