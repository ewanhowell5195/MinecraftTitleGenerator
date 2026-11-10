import vue from "@vitejs/plugin-vue"
import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "vite"
import { mockSubmissions } from "./dev/mockSubmissions.js"
import { PAGES } from "./src/pages.js"
import { creditsHtml } from "./src/server/credits.js"
import { escaped } from "./src/server/http.js"
import { linkedCode, linkedTitleDetails, presetDetails, shareTags } from "./src/server/presets.js"
import { shellHtml, shellPage } from "./src/site/shell.js"

const LIVE = "https://mctitlegenerator.com"
const CREDITS = "virtual:credits"
const STYLE_SCOPES = {
  "src/style.css": "tool",
  "src/fontEditor/editor.css": "editor",
  "src/submissions/submissions.css": "submissions",
  "src/home/home.css": "site",
  "src/legal/legal.css": "site",
  "src/credits/credits.css": "site",
  "src/site/bar.css": "bar"
}
const PRESET_PAGE = /^\/app\/presets(?:\/(\d+))?\/?$/
const APP_PAGE = /^\/app\/(index\.html)?$/
const SUBMISSION_PAGE = /^\/submissions\/\d+(\/edit)?\/?$/

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
      if (SUBMISSION_PAGE.test(new URL(request.url, "http://localhost").pathname)) request.url = "/submissions/"
      next()
    })
  }
}

const creditsModule = {
  name: "credits-module",
  resolveId(id) {
    if (id === CREDITS) return `\0${CREDITS}`
  },
  load(id) {
    if (id === `\0${CREDITS}`) return `export default ${JSON.stringify(creditsHtml(import.meta.dirname))}`
  }
}

const shellPages = {
  name: "shell-pages",
  transformIndexHtml: {
    order: "pre",
    handler(html, context) {
      const page = shellPage(context.path.replace(/^\//, ""))
      return page ? shellHtml(html, page) : html
    }
  }
}

function scopedSelector(selector, prefix) {
  if (/^(:root|html)(?![\w-])/.test(selector)) return selector.replace(/^(:root|html)/, prefix)
  return `${prefix} ${selector}`
}

function scopedStyles() {
  return {
    postcssPlugin: "scoped-styles",
    Once(root) {
      const file = path.relative(import.meta.dirname, root.source?.input.file ?? "").split(path.sep).join("/")
      const scope = STYLE_SCOPES[file]
      if (!scope) return
      const prefix = `:where(:root[data-styles~="${scope}"])`
      root.walkRules(rule => {
        if (rule.parent.type === "atrule" && rule.parent.name.endsWith("keyframes")) return
        rule.selectors = rule.selectors.map(selector => scopedSelector(selector, prefix))
      })
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
  plugins: [vue(), mockSubmissions(), submissionPages, folderSlashes, presetPages, creditsModule, shellPages],
  css: { postcss: { plugins: [scopedStyles()] } },
  build: { rolldownOptions: { input: PAGES.map(page => page.file) } },
  server: { host: "127.0.0.1", port: 9123, strictPort: true, proxy: { "/api": { target: LIVE, changeOrigin: true, configure: allowCookiesOverHttp } } }
})
