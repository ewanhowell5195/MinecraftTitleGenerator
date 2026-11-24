import { fetched } from "../core/api.js"
import { MULTICASE_CHARACTERS } from "./editor/characters.js"
import { platform } from "../core/platform.js"
import { sameValue } from "../core/values.js"
import { CATALOG_VERSION } from "./googleCatalog.js"

const STYLESHEET = "https://fonts.googleapis.com/css2"
const FILE = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/
const TEXT = encodeURIComponent([" "].concat(MULTICASE_CHARACTERS).join(""))
const PREVIEW_TEXT = "ABC"
const PREVIEW_BATCH = 24
const FACES = /font-family: '([^']+)';[^}]*?src: url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g
const FAMILY = /^[A-Za-z0-9 ]{1,80}$/
const STYLE = /^\d{1,4}i?$/
const WEIGHT_NAMES = { 100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semi Bold", 700: "Bold", 800: "Extra Bold", 900: "Black", 1000: "Extra Black" }

let listing = null
const previews = new Map()
const sampleTexts = new Map([[PREVIEW_TEXT, 0]])
let queued = []
let flushing = null

export function googleFontList() {
  listing ??= fetched(platform.asset(`/api/google-fonts?v=${CATALOG_VERSION}`), "The Google Fonts list").then(response => response.json()).then(body => body.fonts).catch(err => {
    listing = null
    throw err
  })
  return listing
}

export function isGoogleFont(value) {
  return value !== null && typeof value === "object" && FAMILY.test(value.google) && STYLE.test(value.style) && sameValue(value, googleFontSource(value.google, value.style))
}

export function googleFontSource(family, style) {
  return { kind: "outline", google: family, style, height: 40, mesh: true }
}

export function styleParts(style) {
  const [, weight, italic] = style.match(/^(\d+)(i?)$/)
  return { weight: Number(weight), italic: !!italic }
}

export function styleLabel(style) {
  const { weight, italic } = styleParts(style)
  const name = WEIGHT_NAMES[weight] ?? `Weight ${weight}`
  return italic ? `${name} Italic` : name
}

function familyQuery({ family, style }) {
  const { weight, italic } = styleParts(style)
  return `family=${family.replaceAll(" ", "+")}:ital,wght@${italic ? 1 : 0},${weight}`
}

function previewName(family, text) {
  if (!sampleTexts.has(text)) sampleTexts.set(text, sampleTexts.size)
  return `Google preview ${sampleTexts.get(text)} ${family}`
}

export function googlePreviewFamily(family, text = PREVIEW_TEXT) {
  return `"${previewName(family, text)}"`
}

async function loadPreviews(batch, text) {
  const css = await (await fetched(`${STYLESHEET}?${batch.map(({ font }) => familyQuery(font)).join("&")}&text=${encodeURIComponent(text)}`, "Google Fonts previews")).text()
  const urls = new Map(Array.from(css.matchAll(FACES), ([, family, url]) => [family, url]))
  for (const { font, settle } of batch) {
    const url = urls.get(font.family)
    if (!url) {
      settle.reject(new Error(`Google Fonts has no preview for ${font.family}`))
      continue
    }
    const face = new FontFace(previewName(font.family, text), `url(${url})`)
    document.fonts.add(face)
    face.load().then(settle.resolve, settle.reject)
  }
}

function flushPreviews() {
  flushing = null
  const waiting = Map.groupBy(queued, item => item.text)
  queued = []
  for (const [text, items] of waiting) {
    for (let start = 0; start < items.length; start += PREVIEW_BATCH) {
      const batch = items.slice(start, start + PREVIEW_BATCH)
      loadPreviews(batch, text).catch(err => batch.forEach(({ settle }) => settle.reject(err)))
    }
  }
}

export function googlePreview(font, text = PREVIEW_TEXT) {
  const key = previewName(font.family, text)
  if (!previews.has(key)) {
    const settle = {}
    previews.set(key, new Promise((resolve, reject) => Object.assign(settle, { resolve, reject })))
    queued.push({ font, text, settle })
    flushing ??= setTimeout(flushPreviews, 50)
  }
  return previews.get(key)
}

export async function googleFontUrl(font) {
  const css = await (await fetched(`${STYLESHEET}?${familyQuery(font)}&text=${TEXT}`, `${font.family} from Google Fonts`, platform.fontUserAgent && { headers: { "User-Agent": platform.fontUserAgent } })).text()
  const url = css.match(FILE)?.[1]
  if (!url) throw new Error(`Google Fonts has no file for ${font.family}`)
  return url
}

export async function googleFontBytes(font) {
  if (!FAMILY.test(font.family) || !STYLE.test(font.style)) throw new Error(`${font.family} isn't a Google font`)
  return platform.cachedFont(`${font.family} ${font.style}`, async () => (await fetched(await googleFontUrl(font), font.family)).arrayBuffer())
}
