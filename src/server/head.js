import { escaped } from "./http.js"

export const SITE_NAME = "Minecraft Title Generator"
export const SHARE_IMAGE = { path: "/home/og.jpg", width: 1200, height: 630, alt: "The Minecraft Title Generator logo" }

export function pageImage(name, label) {
  return { ...SHARE_IMAGE, path: `/home/og-${name}.jpg`, alt: `The Minecraft Title Generator logo, with ${label} under it` }
}

export function shareTags({ title, description, url, image = null, alt = title, width = null, height = null }) {
  const page = [["og:type", "website"], ["og:site_name", SITE_NAME], ["og:locale", "en_GB"], ["og:url", url], ["og:title", title], ["og:description", description]]
  const sized = width && height ? [["og:image:width", String(width)], ["og:image:height", String(height)]] : []
  const picture = image ? [["og:image", image]].concat(sized, [["og:image:alt", alt]]) : []
  const card = `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`
  return page.concat(picture).map(([property, content]) => `<meta property="${property}" content="${escaped(content)}">`).join("") + card
}

export function withoutShareTags(html) {
  return html.replace(/<meta (?:property="og:|name="twitter:)[^>]*>/g, "")
}

export function pageWithDetails(page, details) {
  const { title, description, url, canonical = url } = details
  return new HTMLRewriter()
    .on("title", { element: element => element.setInnerContent(title) })
    .on('meta[name="description"]', { element: element => element.setAttribute("content", description) })
    .on('link[rel="canonical"]', { element: element => element.setAttribute("href", canonical) })
    .on('meta[property^="og:"]', { element: element => element.remove() })
    .on('meta[name^="twitter:"]', { element: element => element.remove() })
    .on("head", { element: element => element.append(shareTags(details), { html: true }) })
    .transform(page)
}
