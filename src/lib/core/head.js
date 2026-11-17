import { escaped } from "./html.js"

export const SITE_NAME = "Minecraft Title Generator"
export const SHARE_IMAGE = { path: "/share/site.jpg", width: 1200, height: 630, alt: "The Minecraft Title Generator logo" }

export function pageImage(name, label) {
  return { ...SHARE_IMAGE, path: `/share/${name}.jpg`, alt: `The Minecraft Title Generator logo, with ${label} under it` }
}

const EMBED_COLOUR = 0xF1822C
const EMBED_LIMITS = { bytes: 3000, buttonUrl: 512 }

function markdownText(text) {
  return text.replace(/[\\*_~`|#>[\]()-]/g, "\\$&")
}

function componentEmbed({ title, description, url, image = null, spaced = false, buttons = [{ label: "Open", url }] }) {
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

const SPLASH_LINKS = [["Make a title", "/app/"], ["Presets", "/app/presets"], ["Font editor", "/font-editor/"], ["Submit", "/submit/"], ["Credits", "/credits/"]]

export const SPLASH_STYLE = "<style>.splash{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;font-family:Gabarito,system-ui,sans-serif;text-align:center;color:var(--muted,#b0b4bd);opacity:0;animation:splash-in .4s ease .5s forwards}.splash h1{margin:0;font-size:28px;color:var(--text,#f1f2f4)}.splash p{max-width:48ch;margin:0}.splash nav{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 16px}.splash a{color:var(--accent,#6cc04a)}@keyframes splash-in{to{opacity:1}}</style>"

export function splashHtml(heading, description) {
  const links = SPLASH_LINKS.map(([label, path]) => `<a href="${path}">${label}</a>`).join("")
  return `<div class="splash"><h1>${escaped(heading)}</h1><p>${escaped(description)}</p><nav>${links}</nav></div>`
}

export function dataScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`
}

export function withoutShareTags(html) {
  return html.replace(/<meta (?:property="og:|name="twitter:)[^>]*>/g, "").replace(/<script id="discord:component-embed"[^>]*>[^<]*<\/script>/g, "")
}
