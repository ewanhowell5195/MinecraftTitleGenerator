import { PAGES, SITE } from "../pages.js"
import { cachedAtEdge } from "./http.js"

const SECONDS = 3600

function entry(path) {
  return `  <url>\n    <loc>${SITE}${path}</loc>\n  </url>`
}

export function sitemapXml(presets) {
  const pages = PAGES.filter(page => !page.hidden).flatMap(page => page.paths.map(path => path.replace(/\/:.*$/, "")))
  const paths = pages.concat(presets.map(preset => `/app/presets/${preset.id}`))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(entry).join("\n")}\n</urlset>\n`
}

export function sitemap(context) {
  return cachedAtEdge(context, async () => {
    const { results } = await context.env.DB.prepare("SELECT id FROM presets WHERE shared = 1 ORDER BY id").all()
    return new Response(sitemapXml(results), { headers: { "Content-Type": "application/xml; charset=utf-8" } })
  }, { seconds: SECONDS, key: new URL("/sitemap.xml", context.request.url).href, browser: `public, max-age=${SECONDS}` })
}
