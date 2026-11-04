import { reactive } from "vue"
import { image } from "./assets.js"
import { canvasLimit } from "./canvas.js"
import { clamp } from "./maths.js"
import { aspectOf, compose, fitTitle, fromAspect, minecraftLayout } from "./render.js"
import { view, viewport } from "./view.js"

export const FRAMINGS = [{ value: "normal", label: "Normal" }, { value: "square", label: "Square" }, { value: "custom", label: "Custom" }, { value: "minecraft", label: "Minecraft" }]
export const MINECRAFT_MODES = [{ value: "1.20", label: "1.20+ Title Texture" }, { value: "1.19", label: "1.19- Title Texture" }, { value: "mojang", label: "Mojang Studios Texture" }]
const TEXTURE_SIZES = [256, 512, 1024, 2048]

const DEFAULTS = {
  tab: "normal",
  width: 1920,
  height: 1080,
  aspectWidth: 16,
  aspectHeight: 9,
  lastChanged: "width",
  linked: true,
  mode: "1.20",
  textureSize: 1024,
  backgroundEnabled: false,
  backgroundStops: [{ colour: "#78b8ff", position: 0 }],
  backgroundSmooth: true,
  backgroundAngle: 0,
  padding: 0,
  outline: false,
  outlineColour: "#FFFFFF",
  outlineWidth: 2
}

const DECORATION = ["backgroundEnabled", "backgroundStops", "backgroundSmooth", "backgroundAngle", "padding"]
const OUTLINE = ["outline", "outlineColour", "outlineWidth"]

const TAB_KEYS = {
  normal: DECORATION,
  square: DECORATION,
  custom: DECORATION.concat("width", "height", "aspectWidth", "aspectHeight", "lastChanged", "linked"),
  minecraft: ["mode", "textureSize"]
}

export const framing = reactive(structuredClone(DEFAULTS))

export function framingModified() {
  return TAB_KEYS[framing.tab].some(key => JSON.stringify(framing[key]) !== JSON.stringify(DEFAULTS[key]))
}

export function resetFraming() {
  for (const key of TAB_KEYS[framing.tab]) framing[key] = structuredClone(DEFAULTS[key])
}

export function outlineModified() {
  return OUTLINE.some(key => framing[key] !== DEFAULTS[key])
}

export function resetOutline() {
  for (const key of OUTLINE) framing[key] = DEFAULTS[key]
}

export function resolutionLimit() {
  return Math.floor(canvasLimit() / (view.antialias ? 2 : 1))
}

function renderResolution() {
  return clamp(Math.round(Number(view.resolution)) || 128, 128, resolutionLimit())
}

export function paddingScale() {
  return (framing.tab === "custom" ? Math.max(framing.width, framing.height) : renderResolution()) / 1024
}

function paddingPixels() {
  return Math.round(framing.padding * paddingScale())
}

export function textureSizes() {
  return TEXTURE_SIZES.filter(size => minecraftLayout(framing.mode, size).width <= resolutionLimit())
}

export function textureSize() {
  const sizes = textureSizes()
  return sizes.includes(framing.textureSize) ? framing.textureSize : sizes.filter(size => size < framing.textureSize).pop() ?? sizes[0]
}

function captureResolution() {
  if (framing.tab !== "minecraft") return renderResolution()
  const title = viewport.titleRect()
  if (!title) return renderResolution()
  const { scale } = fitTitle(minecraftLayout(framing.mode, textureSize()), title.width, title.height)
  return Math.min(Math.ceil(Math.max(title.width, title.height) * scale), resolutionLimit())
}

export async function renderFramed(task) {
  const shot = await viewport.capture(captureResolution(), view.antialias, task)
  return shot && compose(shot, { ...framing, padding: paddingPixels(), textureSize: textureSize() }, await image("render/legacy-title.png"))
}

function around(title, width, height) {
  return { left: title.left + title.width / 2 - width / 2, top: title.top + title.height / 2 - height / 2, width, height }
}

function minecraftPlacement(title) {
  const layout = minecraftLayout(framing.mode, textureSize())
  const { scale, x, y } = fitTitle(layout, title.width, title.height)
  const left = title.left - x / scale
  const top = title.top - y / scale
  return { layout, scale, left, frame: { left, top, width: layout.output[0] / scale, height: layout.output[1] / scale } }
}

export function frameSplit(title) {
  if (framing.tab !== "minecraft") return null
  const { layout, scale, left } = minecraftPlacement(title)
  return layout.split === null ? null : { x: left + layout.split / scale, shift: layout.shift.map(value => value / scale) }
}

export function framePixels(title, rect) {
  if (framing.tab === "custom") return framing.width / rect.width
  if (framing.tab === "minecraft") return minecraftPlacement(title).scale
  return renderResolution() / Math.max(rect.width, rect.height)
}

function union(a, b) {
  const left = Math.min(a.left, b.left)
  const top = Math.min(a.top, b.top)
  return { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top }
}

export function frameBounds(title) {
  return union(title, frameRect(title))
}

export function frameRect(title) {
  if (framing.tab === "minecraft") return minecraftPlacement(title).frame
  const longest = Math.max(title.width, title.height)
  const shortest = framing.tab === "custom" ? Math.min(framing.width, framing.height) : renderResolution()
  const padding = clamp(paddingPixels(), 0, Math.floor((shortest - 1) / 2))
  if (framing.tab === "custom") {
    const ratio = Math.min((framing.width - padding * 2) / title.width, (framing.height - padding * 2) / title.height)
    return around(title, framing.width / ratio, framing.height / ratio)
  }
  const inset = padding * longest / (renderResolution() - padding * 2)
  if (framing.tab === "square") return around(title, longest + inset * 2, longest + inset * 2)
  return around(title, title.width + inset * 2, title.height + inset * 2)
}

function fit() {
  const max = canvasLimit()
  if (framing.width <= max && framing.height <= max) return
  const aspect = framing.width / framing.height
  framing.width = aspect > 1 ? max : Math.max(1, Math.floor(max * aspect))
  framing.height = aspect > 1 ? Math.max(1, Math.floor(max / aspect)) : max
}

function setCapped(key, raw) {
  const value = Math.round(Number(raw))
  if (!(value >= 1)) return false
  framing[key] = Math.min(canvasLimit(), value)
  return true
}

function applyAspect(max) {
  const [width, height] = fromAspect(framing.aspectWidth, framing.aspectHeight, framing.width, framing.height, framing.lastChanged === "width", max)
  framing.width = Math.max(1, width)
  framing.height = Math.max(1, height)
}

export function setResolution(key, raw) {
  if (!setCapped(key, raw)) return
  framing.lastChanged = key
  if (framing.linked) {
    applyAspect(Infinity)
    fit()
  } else {
    [framing.aspectWidth, framing.aspectHeight] = aspectOf(framing.width, framing.height)
  }
}

export function setAspect(key, raw) {
  if (setCapped(key, raw)) applyAspect(canvasLimit())
}
