import { hexOf, rgbOf } from "../core/colour.js"
import { clamp, toRad } from "../core/maths.js"

const MIX_STEPS = 24
const VIVID_FLOOR = 0.6

export const DEFAULT_MIX = "oklab"
export const GRADIENT_MIXES = [{ value: "oklab", label: "Default" }, { value: "short", label: "Short hue" }, { value: "long", label: "Long hue" }, { value: "vivid", label: "Vivid" }]

export function ordered(stops) {
  const list = stops.map(stop => ({ colour: stop.colour, position: clamp(stop.position / 100, 0, 1) }))
  list.sort((a, b) => a.position - b.position)
  return list
}

function toLinear(value) {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function fromLinear(c) {
  const value = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055
  return Math.round(clamp(value, 0, 1) * 255)
}

function toOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(fromLinear)
}

function chroma([, a, b]) {
  return Math.hypot(a, b)
}

function hueTurn(from, to, longer) {
  const turn = (Math.atan2(to[2], to[1]) - Math.atan2(from[2], from[1]) + Math.PI * 3) % (Math.PI * 2) - Math.PI
  if (!longer) return turn
  return turn > 0 ? turn - Math.PI * 2 : turn + Math.PI * 2
}

function alongHue(from, to, t, longer) {
  const hue = Math.atan2(from[2], from[1]) + hueTurn(from, to, longer) * t
  const amount = chroma(from) + (chroma(to) - chroma(from)) * t
  return [amount * Math.cos(hue), amount * Math.sin(hue)]
}

function keptChroma(from, to, t) {
  const a = from[1] + (to[1] - from[1]) * t
  const b = from[2] + (to[2] - from[2]) * t
  const length = Math.hypot(a, b) || 1
  const kept = (chroma(from) + (chroma(to) - chroma(from)) * t) * Math.min(1, VIVID_FLOOR + (1 - VIVID_FLOOR) * length / Math.max(1e-9, (chroma(from) + chroma(to)) / 2))
  const scale = Math.max(length, kept) / length
  return [a * scale, b * scale]
}

const MIXERS = {
  vivid: keptChroma,
  oklab: (from, to, t) => [from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t],
  short: (from, to, t) => alongHue(from, to, t, false),
  long: (from, to, t) => alongHue(from, to, t, true)
}

function mix(a, b, t, mode) {
  const [lightness] = toOklab(a.map((value, i) => value + (b[i] - value) * t))
  return fromOklab([lightness].concat((MIXERS[mode] ?? MIXERS[DEFAULT_MIX])(toOklab(a), toOklab(b), t)))
}

export function blend(a, b, t, mode = DEFAULT_MIX) {
  return hexOf(mix(rgbOf(a), rgbOf(b), t, mode))
}

function smoothStops(stops, mode) {
  const list = []
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    for (let step = 0; step < MIX_STEPS; step++) list.push({ position: from.position + (to.position - from.position) * step / MIX_STEPS, colour: blend(from.colour, to.colour, step / MIX_STEPS, mode) })
  }
  return list.concat(stops.slice(-1))
}

export function movedStopPositions(positions, from, to) {
  if (from === to) return positions.slice()
  const order = Array.from(positions.keys())
  order.splice(to, 0, order.splice(from, 1)[0])
  const last = order.length - 1
  const moved = order.map(index => positions[index])
  moved[0] = positions[0]
  moved[last] = positions[last]
  const between = order.findIndex((index, slot) => slot > 0 && slot < last && (index === from || index === 0 || index === last))
  if (between !== -1) moved[between] = Math.round((moved[between - 1] + moved[between + 1]) / 2)
  return moved
}

export function stopEdges(list) {
  return [0].concat(list.slice(1).map(stop => stop.position), 1)
}

export function gradientStops(stops, smooth, mode = DEFAULT_MIX) {
  const list = ordered(stops)
  if (smooth) return smoothStops(list, mode)
  const edges = stopEdges(list)
  return list.flatMap((stop, i) => [{ position: edges[i], colour: stop.colour }, { position: edges[i + 1], colour: stop.colour }])
}

export function stopColour(stops, t, mode = DEFAULT_MIX) {
  const after = stops.findIndex(stop => stop.position >= t)
  if (after === -1) return stops[stops.length - 1].colour
  if (after === 0) return stops[0].colour
  const from = stops[after - 1]
  const to = stops[after]
  return blend(from.colour, to.colour, (t - from.position) / (to.position - from.position), mode)
}

export function cssGradient(stops, smooth, direction, mode = DEFAULT_MIX) {
  if (stops.length === 1) return stops[0].colour
  return `linear-gradient(${direction}, ${gradientStops(stops, smooth, mode).map(stop => `${stop.colour} ${stop.position * 100}%`).join(", ")})`
}

export function gradientDirection(angle) {
  const turn = toRad(angle)
  return { dx: -Math.sin(turn), dy: Math.cos(turn) }
}

export function gradientReach({ dx, dy }, width, height) {
  return Math.abs(dx) * width / 2 + Math.abs(dy) * height / 2
}

export function gradientLine(left, top, width, height, angle) {
  const direction = gradientDirection(angle)
  const { dx, dy } = direction
  const reach = gradientReach(direction, width, height)
  const centre = [left + width / 2, top + height / 2]
  return [[centre[0] - dx * reach, centre[1] - dy * reach], [centre[0] + dx * reach, centre[1] + dy * reach]]
}
