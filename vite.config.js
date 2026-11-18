import vue from "@vitejs/plugin-vue"
import fs from "node:fs"
import path from "node:path"
import { defineConfig } from "vite"
import { PAGES } from "./src/site/pages.js"
import { creditPeople, creditsHtml } from "./src/site/credits/build.js"
import { stripNames } from "./src/site/home/stripNames.js"
import { escaped } from "./src/lib/core/html.js"
import { dataScript, shareTags, withoutShareTags } from "./src/lib/core/head.js"
import { linkedCode, linkedTitleDetails, presetDetails } from "./src/server/presetPages.js"
import { pageAt, pageFiles, shellHtml } from "./src/site/shell.js"
import { prerender } from "./src/prerender/build.js"

const LIVE = "https://mctitlegenerator.com"
const CREDITS = "virtual:credits"
const PEOPLE = "virtual:people"
const STRIP_NAMES = "virtual:strip-names"
const STYLE_SCOPES = {
  "src/styles/tool.css": "tool",
  "src/fontEditor/editor.css": "editor",
  "src/submissions/submissions.css": "submissions",
  "src/styles/site.css": "site",
  "src/site/legal/legal.css": "site",
  "src/site/credits/credits.css": "site"
}
const PRESET_PAGE = /^\/app\/presets(?:\/(\d+))?\/?$/
const APP_PAGE = /^\/app\/(index\.html)?$/

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
  const { title, description, url, canonical = url, heading = null, data = null } = details
  const page = withoutShareTags(data ? html.replace(/<script type="application\/ld\+json">.*?<\/script>/s, "") : html)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escaped(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, (_, start) => start + escaped(description))
    .replace(/(<link rel="canonical" href=")[^"]*/, (_, start) => start + escaped(canonical))
    .replace(/(<div class="splash">.*?<p>)[^<]*/s, (_, start) => start + escaped(description))
    .replace("</head>", () => `${shareTags(details)}${data ? dataScript(data) : ""}</head>`)
  return heading ? page.replace(/(<div class="splash"><h1>)[^<]*/, (_, start) => start + escaped(heading)) : page
}

const BROWSER_ONLY = new Set(["fluid-tabs", "fluid-marquee", "easy-tooltips"])
const NOTHING = "\0browser-only"

const browserOnly = {
  name: "browser-only",
  enforce: "pre",
  resolveId(id, importer, options) {
    if (options?.ssr && BROWSER_ONLY.has(id)) return NOTHING
  },
  load(id) {
    if (id === NOTHING) return "export default {}"
  }
}

const presetPages = {
  name: "preset-pages",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      try {
        const host = request.headers["x-forwarded-host"]?.split(",")[0] ?? request.headers.host
        const details = await pageDetails(new URL(request.url, `${request.headers["x-forwarded-proto"]?.split(",")[0] ?? "http"}://${host}`))
        if (!details) return next()
        const page = await fs.promises.readFile(path.join(server.config.root, "index.html"), "utf8")
        response.setHeader("Content-Type", "text/html; charset=utf-8")
        response.end(withDetails(await server.transformIndexHtml("/index.html", page, request.originalUrl), details))
      } catch (err) {
        next(err)
      }
    })
  }
}

function slashFolders(server) {
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url, "http://localhost")
    if (url.pathname.endsWith("/") || !PAGES.some(page => page.paths.includes(`${url.pathname}/`))) return next()
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

const creditsModule = {
  name: "credits-module",
  resolveId(id) {
    if (id === CREDITS || id === PEOPLE || id === STRIP_NAMES) return `\0${id}`
  },
  load(id) {
    if (id === `\0${CREDITS}`) return `export default ${JSON.stringify(creditsHtml(import.meta.dirname))}`
    if (id === `\0${PEOPLE}`) return `export default ${JSON.stringify(creditPeople(import.meta.dirname))}`
    if (id === `\0${STRIP_NAMES}`) return `export default ${JSON.stringify(stripNames(import.meta.dirname))}`
  }
}

const shellPages = {
  name: "shell-pages",
  enforce: "post",
  transformIndexHtml: {
    order: "pre",
    handler(html, context) {
      if (!context.server) return html
      return shellHtml(html, pageAt(new URL(context.originalUrl ?? context.path, "http://localhost").pathname))
    }
  },
  generateBundle(_, bundle) {
    if (this.environment.name !== "client") return
    const shell = bundle["index.html"]
    if (!shell) throw new Error("the build has no index.html to make the pages from")
    const source = String(shell.source)
    for (const page of PAGES) {
      for (const file of pageFiles(page)) {
        if (file === "index.html") shell.source = shellHtml(source, page)
        else this.emitFile({ type: "asset", fileName: file, source: shellHtml(source, page) })
      }
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

const renderedPages = {
  name: "rendered-pages",
  apply: "build",
  async closeBundle() {
    if (this.environment.name !== "client") return
    await prerender(this.environment.config.root, this.environment.config.build.outDir)
  }
}

export default defineConfig({
  plugins: [vue(), browserOnly, folderSlashes, presetPages, creditsModule, shellPages, renderedPages],
  css: { postcss: { plugins: [scopedStyles()] } },
  ssr: { noExternal: [/^fluid-/, /^easy-tooltips/] },
  build: { ssrManifest: true, rolldownOptions: { input: "index.html" } },
  server: { host: "127.0.0.1", port: 9123, strictPort: true, proxy: { "/api": { target: LIVE, changeOrigin: true, configure: allowCookiesOverHttp } } }
})
