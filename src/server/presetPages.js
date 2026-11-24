import { SITE_NAME, pageImage } from "../lib/core/head.js"
import { LIMITS } from "../lib/core/limits.js"
import { pictureUrl, previewAlt } from "../lib/core/pictures.js"
import { seedScript } from "../lib/core/seed.js"
import { SORTS } from "../app/presets/presetText.js"
import { pageWithDetails } from "./head.js"
import { presetList, sharedPreset } from "./presets.js"
import { TEMPLATES, presetsHtml } from "./presetTemplates.js"
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
    return { title, description, url, image, alt: previewAlt(preset.name), spaced: true, heading, data: presetData(origin, preset, url, image) }
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

async function presetTemplates({ env, request }) {
  const response = await env.ASSETS.fetch(new URL(TEMPLATES, request.url))
  if (!response.ok) throw new Error(`the presets page templates could not be read (${response.status})`)
  return response.json()
}

function listQuery(address) {
  const sort = address.searchParams.get("sort")
  return { sort: SORTS.some(option => option.value === sort) ? sort : SORTS[0].value, search: address.searchParams.get("search") ?? "", offset: 0 }
}

export async function presetPage(context) {
  const { env, params, request } = context
  const address = new URL(request.url)
  const code = params.id?.length ? null : linkedCode(address)
  if (code) return linkedTitlePage(await appShell(context), address, code, "/app/presets")
  const id = Number(params.id?.[0])
  const known = params.id?.length === 1 && Number.isSafeInteger(id) && id > 0
  const selected = known ? await sharedPreset(env, id) : null
  if (params.id?.length && !selected) {
    const missing = pageWithDetails(await appShell(context), { ...presetDetails(address.origin, null, id), hidden: true })
    return new Response(missing.body, { status: 404, headers: missing.headers })
  }
  const query = listQuery(address)
  const [page, list, templates] = await Promise.all([appShell(context), presetList(env, query), presetTemplates(context)])
  const body = presetsHtml(templates, { presets: list.presets, selected, sort: query.sort, search: query.search })
  const seed = { page: { sort: query.sort, search: query.search, presets: list.presets, more: list.more }, preset: selected }
  return pageWithDetails(page, { ...presetDetails(address.origin, selected, id), body, head: templates.links + seedScript(seed) })
}

export function linkedPreset(url) {
  const id = Number(url.searchParams.get("preset"))
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function linkedPresetDetails(url, preset) {
  const { data, heading, ...details } = presetDetails(url.origin, preset, preset.id)
  return { ...details, url: url.href, canonical: details.url }
}

export async function appPage(context) {
  const { env, next, request } = context
  const url = new URL(request.url)
  const code = linkedCode(url)
  if (code) return linkedTitlePage(await appShell(context), url, code, "/app/")
  const id = linkedPreset(url)
  const preset = id === null ? null : await sharedPreset(env, id)
  return preset ? pageWithDetails(await appShell(context), linkedPresetDetails(url, preset)) : next()
}
