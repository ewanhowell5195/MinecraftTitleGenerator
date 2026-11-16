import { SITE_NAME, pageImage } from "../lib/core/head.js"
import { LIMITS } from "../lib/core/limits.js"
import { pictureUrl } from "../lib/core/pictures.js"
import { pageWithDetails } from "./head.js"

export function presetPageDetails(name, id) {
  if (name === null) return { title: `Presets | ${SITE_NAME}`, description: "Browse Minecraft style titles other people have shared, and open any of them in the generator to make your own!", path: "/app/presets" }
  return { title: `${name} | ${SITE_NAME}`, description: `Open this title in the ${SITE_NAME} to change it and make your own!`, path: `/app/presets/${id}` }
}

export function linkedCode(url) {
  const code = url.searchParams.get("title")
  return code && /^[0-9A-Za-z_-]+$/.test(code) && code.length <= LIMITS.code ? code : null
}

export function linkedTitleDetails(url, code, canonical) {
  return { title: SITE_NAME, description: `Open this title in the ${SITE_NAME} to change it and make your own!`, url: url.href, canonical: `${url.origin}${canonical}`, image: pictureUrl({ code }, "png"), spaced: true }
}

export function presetDetails(origin, preset, id) {
  const { title, description, path } = presetPageDetails(preset?.name ?? null, id)
  if (preset?.fingerprint) return { title, description, url: `${origin}${path}`, image: pictureUrl(preset, "png"), spaced: true }
  const { path: image, ...size } = pageImage("presets", "Presets")
  return { title, description, url: `${origin}${path}`, ...size, image: `${origin}${image}` }
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
  const preset = known ? await env.DB.prepare("SELECT name, fingerprint FROM presets WHERE id = ? AND shared = 1").bind(id).first() : null
  return pageWithDetails(page, presetDetails(address.origin, preset, id))
}

export async function appPage(context) {
  const { next, request } = context
  const url = new URL(request.url)
  const code = linkedCode(url)
  if (!code) return next()
  return linkedTitlePage(await appShell(context), url, code, "/app/")
}
