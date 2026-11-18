import { SITE_NAME, pageImage } from "../lib/core/head.js"
import { LIMITS } from "../lib/core/limits.js"
import { pictureUrl, previewAlt } from "../lib/core/pictures.js"
import { pageWithDetails } from "./head.js"
import { WEBSITE, structuredData } from "../site/pages.js"

export function presetPageDetails(name, id, author = null) {
  if (name === null) return { title: `Presets | ${SITE_NAME}`, description: "Browse Minecraft style titles other people have shared, and open any of them in the generator to make your own!", path: "/app/presets" }
  return { title: `${name} | ${SITE_NAME}`, description: `${name}, a Minecraft style title ${author ? `by ${author}` : "shared by the community"}. Open it in the ${SITE_NAME} to change it and make your own!`, path: `/app/presets/${id}` }
}

function trail(origin, steps) {
  return { "@type": "BreadcrumbList", itemListElement: [[SITE_NAME, `${origin}/`]].concat(steps).map(([name, item], index) => ({ "@type": "ListItem", position: index + 1, name, item })) }
}

function presetData(origin, preset, url, image) {
  if (!preset) return structuredData({ "@type": "CollectionPage", "@id": `${url}#page`, name: "Presets", url, isPartOf: { "@id": WEBSITE["@id"] } }, trail(origin, [["Presets", url]]))
  const work = { "@type": "CreativeWork", "@id": `${url}#title`, name: preset.name, url, image, isPartOf: { "@id": WEBSITE["@id"] }, ...(preset.author && { author: { "@type": "Person", name: preset.author } }), ...(preset.createdAt && { datePublished: new Date(preset.createdAt).toISOString() }) }
  return structuredData(work, trail(origin, [["Presets", `${origin}/app/presets`], [preset.name, url]]))
}

export function linkedCode(url) {
  const code = url.searchParams.get("title")
  return code && /^[0-9A-Za-z_-]+$/.test(code) && code.length <= LIMITS.code ? code : null
}

export function linkedTitleDetails(url, code, canonical) {
  return { title: SITE_NAME, description: `Open this title in the ${SITE_NAME} to change it and make your own!`, url: url.href, canonical: `${url.origin}${canonical}`, image: pictureUrl({ code }, "png"), spaced: true }
}

export function presetDetails(origin, preset, id) {
  const { title, description, path } = presetPageDetails(preset?.name ?? null, id, preset?.author ?? null)
  const url = `${origin}${path}`
  const heading = preset?.name ?? "Presets"
  if (preset?.fingerprint) {
    const image = pictureUrl(preset, "png")
    return { title, description, url, image, alt: previewAlt(preset.name), spaced: true, preview: true, heading, data: presetData(origin, preset, url, image) }
  }
  const { path: image, ...size } = pageImage("presets", "Presets")
  return { title, description, url, ...size, image: `${origin}${image}`, heading, data: presetData(origin, preset?.name ? preset : null, url, `${origin}${image}`) }
}

function linkedTitlePage(page, url, code, canonical) {
  return pageWithDetails(page, linkedTitleDetails(url, code, canonical))
}

function appShell({ env, request }) {
  return env.ASSETS.fetch(new URL("/app/", request.url))
}

export async function presetPage(context) {
  const { env, params, request } = context
  const page = await appShell(context)
  const address = new URL(request.url)
  const code = params.id?.length ? null : linkedCode(address)
  if (code) return linkedTitlePage(page, address, code, "/app/presets")
  const id = Number(params.id?.[0])
  const known = params.id?.length === 1 && Number.isSafeInteger(id) && id > 0
  const preset = known ? await env.DB.prepare("SELECT name, fingerprint, created_at AS createdAt, (SELECT users.name FROM users WHERE users.id = presets.user_id) AS author FROM presets WHERE id = ? AND shared = 1").bind(id).first() : null
  return pageWithDetails(page, presetDetails(address.origin, preset, id))
}

export async function appPage(context) {
  const { next, request } = context
  const url = new URL(request.url)
  const code = linkedCode(url)
  if (!code) return next()
  return linkedTitlePage(await appShell(context), url, code, "/app/")
}
