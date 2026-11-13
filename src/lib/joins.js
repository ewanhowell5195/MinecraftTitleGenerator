function rowSpan(glyph, row) {
  let first = -1
  let last = -1
  for (let column = 0; column < glyph.width; column++) {
    if (!glyph.mask[row * glyph.width + column]) continue
    if (first < 0) first = column
    last = column
  }
  return first < 0 ? null : [first, last + 1]
}

function cut(glyph, side, row, at) {
  glyph.clips ??= { left: new Map(), right: new Map() }
  glyph.clips[side].set(row, at)
}

function base(glyph) {
  return glyph.bottom + (glyph.lift ?? 0)
}

export function joinNeighbours(chain) {
  for (const [index, right] of chain.entries()) {
    const left = chain[index - 1]
    if (!left || left.fine || right.fine) continue
    const low = Math.max(base(left), base(right))
    const high = Math.min(base(left) + left.height, base(right) + right.height)
    for (let y = low; y < high; y++) {
      const own = rowSpan(left, y - base(left))
      const next = rowSpan(right, y - base(right))
      if (!own || !next) continue
      const end = left.placedX + own[1]
      const start = right.placedX + next[0]
      if (end <= start) continue
      const middle = (end + start) / 2
      cut(left, "right", y - base(left), middle - left.placedX)
      cut(right, "left", y - base(right), middle - right.placedX)
    }
  }
}

export function clippedBoxes(boxes, glyph, x) {
  if (!glyph.clips) return boxes
  const { left, right } = glyph.clips
  const out = []
  for (const box of boxes) {
    let start = box.from[1]
    while (start < box.to[1]) {
      const row = start - glyph.bottom
      const low = x + (left.get(row) ?? -Infinity)
      const high = x + (right.get(row) ?? Infinity)
      let end = start + 1
      while (end < box.to[1] && left.get(end - glyph.bottom) === left.get(row) && right.get(end - glyph.bottom) === right.get(row)) end++
      const from = Math.max(box.from[0], low)
      const to = Math.min(box.to[0], high)
      if (from < to) out.push({ ...box, from: [from, start], to: [to, end], faces: { ...box.faces, down: box.faces.down && start === box.from[1], up: box.faces.up && end === box.to[1] } })
      start = end
    }
  }
  return out
}

export function joinedMask(glyph, pad) {
  const neighbours = [glyph.previous, glyph.next].filter(other => other && !other.fine && other.placedX !== undefined)
  if (!neighbours.length || glyph.placedX === undefined) return null
  const width = glyph.width + pad * 2
  const height = glyph.height + pad * 2
  const mask = new Uint8Array(width * height)
  for (let row = 0; row < glyph.height; row++) mask.set(glyph.mask.subarray(row * glyph.width, (row + 1) * glyph.width), (row + pad) * width + pad)
  for (const other of neighbours) {
    const dx = Math.round(other.placedX - glyph.placedX)
    const dy = base(other) - base(glyph)
    for (let row = 0; row < other.height; row++) {
      const y = row + dy + pad
      if (y < 0 || y >= height) continue
      for (let column = 0; column < other.width; column++) {
        const at = column + dx + pad
        if (at >= 0 && at < width && other.mask[row * other.width + column]) mask[y * width + at] = 1
      }
    }
  }
  return { ...glyph, mask, width, height, bottom: glyph.bottom - pad }
}
