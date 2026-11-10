import { escaped } from "../server/http.js"
import { PAGES, SITE } from "../pages.js"

function shareTags(page, url) {
  if (!page.share) return []
  return [
    "<meta property=\"og:type\" content=\"website\">",
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${escaped(page.title)}">`,
    `<meta property="og:description" content="${escaped(page.description)}">`,
    `<meta property="og:image" content="${SITE}/home/og.jpg">`,
    "<meta name=\"twitter:card\" content=\"summary_large_image\">"
  ]
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
    "<meta name=\"theme-color\" content=\"#111214\">"
  ].concat(page.hidden ? "<meta name=\"robots\" content=\"noindex\">" : [], [
    `<link rel="canonical" href="${url}">`,
    "<link rel=\"icon\" href=\"/favicon.ico\" sizes=\"32x32\">",
    "<link rel=\"icon\" href=\"/favicon.svg\" type=\"image/svg+xml\">",
    "<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">"
  ], shareTags(page, url), page.head ?? [])
  return html
    .replace("<html lang=\"en\">", `<html lang="en" data-styles="${page.styles}">`)
    .replace("<head></head>", `<head>\n    ${head.join("\n    ")}\n  </head>`)
}
