function crosses(across, up) {
  return up.x >= across.from && up.x <= across.to && across.y >= up.from && across.y <= up.to
}

function independent(acrosses, ups) {
  const links = acrosses.map(across => ups.flatMap((up, index) => crosses(across, up) ? [index] : []))
  const partner = new Array(ups.length).fill(-1)
  function claim(across, tried) {
    for (const up of links[across]) {
      if (tried.has(up)) continue
      tried.add(up)
      if (partner[up] !== -1 && !claim(partner[up], tried)) continue
      partner[up] = across
      return true
    }
    return false
  }
  for (const across of acrosses.keys()) claim(across, new Set())
  const reached = new Set()
  const blocked = new Set()
  const open = Array.from(acrosses.keys()).filter(across => !partner.includes(across))
  while (open.length) {
    const across = open.pop()
    if (reached.has(across)) continue
    reached.add(across)
    for (const up of links[across]) {
      if (blocked.has(up)) continue
      blocked.add(up)
      open.push(partner[up])
    }
  }
  return acrosses.filter((across, index) => reached.has(index)).concat(ups.filter((up, index) => !blocked.has(index)))
}

export function maskReader(mask, width, height) {
  return (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1
}

export function rectangles(mask, width, height) {
  const at = maskReader(mask, width, height)
  const floors = new Uint8Array(width * (height + 1))
  const walls = new Uint8Array((width + 1) * height)
  const inner = new Map()
  const key = (x, y) => y * (width + 1) + x
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const solid = [at(x - 1, y - 1), at(x, y - 1), at(x - 1, y), at(x, y)]
      if (solid.filter(Boolean).length === 3) inner.set(key(x, y), { x, y, right: solid[1] && solid[3], above: solid[2] && solid[3] })
    }
  }
  const floorOpen = (x, y) => at(x, y - 1) && at(x, y)
  const wallOpen = (x, y) => at(x - 1, y) && at(x, y)

  const acrosses = []
  const ups = []
  for (const { x, y, right, above } of inner.values()) {
    if (right) {
      let end = x
      while (floorOpen(end, y) && (end === x || !inner.has(key(end, y)))) end++
      if (inner.get(key(end, y))?.right === false && end > x) acrosses.push({ y, from: x, to: end })
    }
    if (above) {
      let end = y
      while (wallOpen(x, end) && (end === y || !inner.has(key(x, end)))) end++
      if (inner.get(key(x, end))?.above === false && end > y) ups.push({ x, from: y, to: end })
    }
  }

  for (const chord of independent(acrosses, ups)) {
    const ends = chord.x === undefined ? [key(chord.from, chord.y), key(chord.to, chord.y)] : [key(chord.x, chord.from), key(chord.x, chord.to)]
    for (const end of ends) inner.delete(end)
    for (let step = chord.from; step < chord.to; step++) {
      if (chord.x === undefined) floors[chord.y * width + step] = 1
      else walls[step * (width + 1) + chord.x] = 1
    }
  }

  const wallAt = (x, y) => y >= 0 && y < height && walls[y * (width + 1) + x]
  for (const { x, y, right } of inner.values()) {
    const step = right ? 1 : -1
    const cell = column => right ? column : column - 1
    for (let column = x; floorOpen(cell(column), y); column += step) {
      if (column !== x && (wallAt(column, y - 1) || wallAt(column, y))) break
      floors[y * width + cell(column)] = 1
    }
  }

  const used = new Uint8Array(width * height)
  const found = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y) || used[y * width + x]) continue
      let right = x + 1
      while (at(right, y) && !walls[y * (width + 1) + right]) right++
      let top = y + 1
      while (at(x, top) && !floors[top * width + x]) top++
      for (let row = y; row < top; row++) used.fill(1, row * width + x, row * width + right)
      found.push([x, y, right - x, top - y])
    }
  }
  return found
}
