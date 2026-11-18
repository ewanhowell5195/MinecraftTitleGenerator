import { PAGES, SITE } from "../site/pages.js"
import { pictureUrl } from "../lib/core/pictures.js"
import { cachedAtEdge } from "./http.js"

const SECONDS = 3600

function entry({ path, image = null }) {
  const picture = image ? `\n    <image:image>\n      <image:loc>${image}</image:loc>\n    </image:image>` : ""
  return `  <url>\n    <loc>${SITE}${path}</loc>${picture}\n  </url>`
}

export function sitemapXml(presets) {
  const pages = PAGES.filter(page => !page.hidden).flatMap(page => page.paths.filter((path, index) => index === 0 || path.includes(":")).map(path => ({ path: path.replace(/\/:.*$/, "") })))
  const entries = pages.concat(presets.map(preset => ({ path: `/app/presets/${preset.id}`, image: preset.fingerprint ? pictureUrl(preset, "png") : null })))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.map(entry).join("\n")}\n</urlset>\n`
}

export function sitemap(context) {
  return cachedAtEdge(context, async () => {
    const { results } = await context.env.DB.prepare("SELECT id, fingerprint FROM presets WHERE shared = 1 ORDER BY id").all()
    return new Response(sitemapXml(results), { headers: { "Content-Type": "application/xml; charset=utf-8" } })
  }, { seconds: SECONDS, key: new URL("/sitemap.xml", context.request.url).href, browser: `public, max-age=${SECONDS}` })
}
