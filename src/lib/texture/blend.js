const SEPARABLE = {
  "source-over": (b, s) => s,
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => b <= 0.5 ? s * 2 * b : s + (2 * b - 1) - s * (2 * b - 1),
  lighter: (b, s) => Math.min(1, b + s),
  "soft-light": softLight,
  difference: (b, s) => Math.abs(b - s)
}

const NON_SEPARABLE = {
  color: (b, s) => setLum(s, lum(b)),
  hue: (b, s) => setLum(setSat(s, sat(b)), lum(b)),
  saturation: (b, s) => setLum(setSat(b, sat(s)), lum(b))
}

function softLight(b, s) {
  if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b)
  const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b)
  return b + (2 * s - 1) * (d - b)
}

function lum([r, g, b]) {
  return 0.3 * r + 0.59 * g + 0.11 * b
}

function clip(c) {
  const l = lum(c)
  const min = Math.min(...c)
  const max = Math.max(...c)
  let out = c
  if (min < 0) out = out.map(v => l + (v - l) * l / (l - min))
  if (max > 1) out = out.map(v => l + (v - l) * (1 - l) / (max - l))
  return out
}

function setLum(c, l) {
  const d = l - lum(c)
  return clip(c.map(v => v + d))
}

function sat(c) {
  return Math.max(...c) - Math.min(...c)
}

function setSat(c, s) {
  const max = Math.max(...c)
  const min = Math.min(...c)
  if (max === min) return [0, 0, 0]
  return c.map(v => (v - min) * s / (max - min))
}

export function blend(mode, base, colour) {
  const b = base.map(v => v / 255)
  const s = colour.map(v => v / 255)
  if (SEPARABLE[mode]) return b.map((v, i) => SEPARABLE[mode](v, s[i]) * 255)
  if (NON_SEPARABLE[mode]) return NON_SEPARABLE[mode](b, s).map(v => v * 255)
  throw new Error(`unknown blend mode ${mode}`)
}
