function rectangles(mask, width, height) {
  const used = new Uint8Array(width * height)
  const open = index => mask[index] && !used[index]
  function runOpen(from, length) {
    for (let i = 0; i < length; i++) {
      if (!open(from + i)) return false
    }
    return true
  }
  const rects = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (!open(start)) continue
      let w = 0
      while (x + w < width && open(start + w)) w++
      let h = 1
      while (y + h < height && runOpen((y + h) * width + x, w)) h++
      for (let j = 0; j < h; j++) used.fill(1, (y + j) * width + x, (y + j) * width + x + w)
      rects.push([x, y, w, h])
    }
  }
  return rects
}

function cuts(count, state) {
  const points = [0]
  for (let i = 1; i < count; i++) {
    if (state(i) !== state(i - 1)) points.push(i)
  }
  points.push(count)
  return points
}

export function boxesFor(mask, width, height, originX = 0, originY = 0) {
  const at = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1
  const boxes = []
  for (const [x, y, w, h] of rectangles(mask, width, height)) {
    const rows = cuts(h, i => at(x - 1, y + i) | at(x + w, y + i) << 1)
    const cols = cuts(w, i => at(x + i, y - 1) | at(x + i, y + h) << 1)
    for (let r = 0; r < rows.length - 1; r++) {
      for (let c = 0; c < cols.length - 1; c++) {
        const x0 = x + cols[c]
        const x1 = x + cols[c + 1]
        const y0 = y + rows[r]
        const y1 = y + rows[r + 1]
        boxes.push({
          from: [originX + x0, originY + y0],
          to: [originX + x1, originY + y1],
          faces: { front: true, back: true, west: !at(x0 - 1, y0), east: !at(x1, y0), down: !at(x0, y0 - 1), up: !at(x0, y1) },
          internal: { up: y1 !== height, down: y0 !== 0 }
        })
      }
    }
  }
  return boxes
}

const SIDES = [
  { name: "front", kind: "front", quad: (a, b) => [[a[0], a[1], a[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], a[1], a[2]]] },
  { name: "back", kind: "back", quad: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]] },
  { name: "west", kind: "side", quad: (a, b) => [[a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]]] },
  { name: "east", kind: "side", quad: (a, b) => [[b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]]] },
  { name: "down", kind: "bottom", quad: (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]] },
  { name: "up", kind: "top", quad: (a, b) => [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]]] }
]

export function boxFaces(boxes, zFront, zBack) {
  const out = []
  for (const box of boxes) {
    const a = [box.from[0], box.from[1], zFront]
    const b = [box.to[0], box.to[1], zBack]
    for (const { name, kind, quad } of SIDES) {
      if (box.faces[name]) out.push({ points: quad(a, b), kind, name, internal: box.internal[name] ?? false })
    }
  }
  return out
}
