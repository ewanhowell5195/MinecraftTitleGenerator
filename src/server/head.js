import { escaped } from "./http.js"

export const SITE_NAME = "Minecraft Title Generator"
export const SHARE_IMAGE = { path: "/home/og.jpg", width: 1200, height: 630, alt: "The Minecraft Title Generator logo" }

export function pageImage(name, label) {
  return { ...SHARE_IMAGE, path: `/home/og-${name}.jpg`, alt: `The Minecraft Title Generator logo, with ${label} under it` }
}

export const EMBED_COLOUR = 0xF1822C
export const EMBED_LIMITS = { bytes: 3000, buttonUrl: 512 }

function markdownText(text) {
  return text.replace(/[\\*_~`|#>[\]()-]/g, "\\$&")
}

export function componentEmbed({ title, description, url, image = null, spaced = false, buttons = [{ label: "Open", url }] }) {
  const components = [{ type: 10, content: `## ${markdownText(title.replace(` | ${SITE_NAME}`, ""))}\n${description}` }]
  if (image && spaced) components.push({ type: 14, divider: false, spacing: 1 })
  if (image) components.push({ type: 12, items: [{ media: { url: image } }] })
  const linked = buttons.filter(button => button.url.length <= EMBED_LIMITS.buttonUrl)
  if (linked.length) components.push({ type: 1, components: linked.map(button => ({ type: 2, style: 5, label: button.label, url: button.url })) })
  const json = JSON.stringify({ component: { type: 17, accent_color: EMBED_COLOUR, components } }).replace(/</g, "\\u003c")
  return new TextEncoder().encode(json).length > EMBED_LIMITS.bytes ? "" : `<script id="discord:component-embed" type="application/json">${json}</script>`
}

export function shareTags({ title, description, url, image = null, alt = title, width = null, height = null, spaced, buttons }) {
  const page = [["og:type", "website"], ["og:site_name", SITE_NAME], ["og:locale", "en_GB"], ["og:url", url], ["og:title", title], ["og:description", description]]
  const sized = width && height ? [["og:image:width", String(width)], ["og:image:height", String(height)]] : []
  const picture = image ? [["og:image", image]].concat(sized, [["og:image:alt", alt]]) : []
  const card = `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`
  return page.concat(picture).map(([property, content]) => `<meta property="${property}" content="${escaped(content)}">`).join("") + card + componentEmbed({ title, description, url, image, spaced, buttons })
}

export function withoutShareTags(html) {
  return html.replace(/<meta (?:property="og:|name="twitter:)[^>]*>/g, "").replace(/<script id="discord:component-embed"[^>]*>[^<]*<\/script>/g, "")
}

export function pageWithDetails(page, details) {
  const { title, description, url, canonical = url } = details
  return new HTMLRewriter()
    .on("title", { element: element => element.setInnerContent(title) })
    .on('meta[name="description"]', { element: element => element.setAttribute("content", description) })
    .on('link[rel="canonical"]', { element: element => element.setAttribute("href", canonical) })
    .on('meta[property^="og:"]', { element: element => element.remove() })
    .on('meta[name^="twitter:"]', { element: element => element.remove() })
    .on('script[id="discord:component-embed"]', { element: element => element.remove() })
    .on("head", { element: element => element.append(shareTags(details), { html: true }) })
    .transform(page)
}
