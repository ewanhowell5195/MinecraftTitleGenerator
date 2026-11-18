import { dataScript, shareTags } from "../lib/core/head.js"
import { escaped } from "../lib/core/html.js"

export function pageWithDetails(page, details) {
  const { title, description, url, canonical = url, heading = null, data = null, preview = false } = details
  const rewriter = new HTMLRewriter()
    .on("title", { element: element => element.setInnerContent(title) })
    .on('meta[name="description"]', { element: element => element.setAttribute("content", description) })
    .on('link[rel="canonical"]', { element: element => element.setAttribute("href", canonical) })
    .on('meta[property^="og:"]', { element: element => element.remove() })
    .on('meta[name^="twitter:"]', { element: element => element.remove() })
    .on('script[id="discord:component-embed"]', { element: element => element.remove() })
    .on(".splash p", { element: element => element.setInnerContent(description) })
    .on("head", { element: element => element.append(shareTags(details) + (data ? dataScript(data) : ""), { html: true }) })
  if (heading) rewriter.on(".splash h1", { element: element => element.setInnerContent(heading) })
  if (preview) rewriter.on(".splash h1", { element: element => element.after(`<img src="${escaped(details.image)}" alt="${escaped(details.alt)}">`, { html: true }) })
  if (data) rewriter.on('script[type="application/ld+json"]', { element: element => element.remove() })
  return rewriter.transform(page)
}
