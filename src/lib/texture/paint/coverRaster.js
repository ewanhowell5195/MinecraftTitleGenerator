const REACH = 0.75

export const STRIDE = 17

function cornerAt(triangles, at) {
  return { u: triangles[at], v: triangles[at + 1], x: triangles[at + 2], y: triangles[at + 3], z: triangles[at + 4] }
}

function bakeTriangle(target, a, b, c, reach, view, source) {
  const { width, height, words, written } = target
  const area = (b.u - a.u) * (c.v - a.v) - (c.u - a.u) * (b.v - a.v)
  if (Math.abs(area) < 1e-9) return
  const x0 = Math.max(0, Math.floor(Math.min(a.u, b.u, c.u) - reach))
  const x1 = Math.min(width, Math.ceil(Math.max(a.u, b.u, c.u) + reach))
  const y0 = Math.max(0, Math.floor(Math.min(a.v, b.v, c.v) - reach))
  const y1 = Math.min(height, Math.ceil(Math.max(a.v, b.v, c.v) + reach))
  if (x0 >= x1 || y0 >= y1) return
  const au = (b.v - c.v) / area
  const av = (c.u - b.u) / area
  const ac = (b.u * c.v - c.u * b.v) / area
  const bu = (c.v - a.v) / area
  const bv = (a.u - c.u) / area
  const bc = (c.u * a.v - a.u * c.v) / area
  const limitA = -(reach + 1e-9) * Math.hypot(c.u - b.u, c.v - b.v) / Math.abs(area)
  const limitB = -(reach + 1e-9) * Math.hypot(a.u - c.u, a.v - c.v) / Math.abs(area)
  const limitC = -(reach + 1e-9) * Math.hypot(b.u - a.u, b.v - a.v) / Math.abs(area)
  const { orthographic, lens, fitX, fitY, scale, imageWidth, imageHeight } = view
  for (let py = y0; py < y1; py++) {
    const cv = py + 0.5
    for (let px = x0; px < x1; px++) {
      const index = py * width + px
      if (reach && written[index]) continue
      const cu = px + 0.5
      let wa = au * cu + av * cv + ac
      let wb = bu * cu + bv * cv + bc
      let wc = 1 - wa - wb
      if (wa < limitA || wb < limitB || wc < limitC) continue
      if (reach) {
        wa = wa > 0 ? wa : 0
        wb = wb > 0 ? wb : 0
        wc = wc > 0 ? wc : 0
        const total = wa + wb + wc
        wa /= total
        wb /= total
        wc /= total
      }
      const x = wa * a.x + wb * b.x + wc * c.x
      const y = wa * a.y + wb * b.y + wc * c.y
      const depth = orthographic ? 1 : wa * a.z + wb * b.z + wc * c.z
      const sx = orthographic ? x / lens : x / depth
      const sy = orthographic ? y / (lens * lens) : y / depth
      let ix = Math.floor((sx - fitX) / scale)
      let iy = Math.floor((-sy - fitY) / scale)
      ix = ix < 0 ? 0 : ix >= imageWidth ? imageWidth - 1 : ix
      iy = iy < 0 ? 0 : iy >= imageHeight ? imageHeight - 1 : iy
      words[index] = source[iy * imageWidth + ix]
      written[index] = 1
    }
  }
}

export function runBake({ pages, triangles, view }, source) {
  const drawn = pages.map(() => null)
  const count = triangles.length / STRIDE
  for (const reach of [0, REACH]) {
    for (let triangle = 0; triangle < count; triangle++) {
      const at = triangle * STRIDE
      if (reach && triangles[at + 1]) continue
      const page = triangles[at]
      if (!drawn[page]) {
        const [width, height] = pages[page]
        drawn[page] = { width, height, words: new Uint32Array(width * height), written: new Uint8Array(width * height) }
      }
      bakeTriangle(drawn[page], cornerAt(triangles, at + 2), cornerAt(triangles, at + 7), cornerAt(triangles, at + 12), reach, view, source)
    }
  }
  return drawn.map(item => item && item.words)
}
