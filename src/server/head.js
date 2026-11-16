import { shareTags } from "../lib/head.js"

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
