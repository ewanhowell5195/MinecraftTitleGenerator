import { escaped } from "../server/http.js"
import { SHARE_IMAGE, pageImage, shareTags } from "../server/head.js"
import { PAGES, SITE } from "../pages.js"

function imageOf(page) {
  const { path, ...image } = page.image ? pageImage(page.name, page.image) : SHARE_IMAGE
  return { ...image, image: `${SITE}${path}` }
}

export function shellPage(file) {
  return PAGES.find(page => page.file === file) ?? null
}

export function shellHtml(html, page) {
  const url = `${SITE}${page.paths[0].startsWith("/:") ? "/404" : page.paths[0]}`
  const head = [
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<base href=\"/\">",
    `<title>${escaped(page.title)}</title>`,
    `<meta name="description" content="${escaped(page.description)}">`,
    "<meta name=\"color-scheme\" content=\"dark\">",
    "<meta name=\"theme-color\" content=\"#F1822C\">"
  ].concat(page.hidden ? "<meta name=\"robots\" content=\"noindex\">" : [], [
    `<link rel="canonical" href="${url}">`,
    "<link rel=\"icon\" href=\"/favicon.ico\" sizes=\"32x32\">",
    "<link rel=\"icon\" href=\"/favicon.svg\" type=\"image/svg+xml\">",
    "<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">",
    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
    "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
    "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Gabarito:wght@400..900&display=swap\">"
  ], page.hidden ? [] : shareTags({ title: page.title, description: page.description, url, ...imageOf(page) }), page.data ? `<script type="application/ld+json">${JSON.stringify(page.data).replace(/</g, "\\u003c")}</script>` : [], page.head ?? [])
  return html
    .replace("<html lang=\"en\">", `<html lang="en" data-styles="${page.styles}">`)
    .replace("<head></head>", `<head>\n    ${head.join("\n    ")}\n  </head>`)
}
