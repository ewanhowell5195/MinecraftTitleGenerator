const CASES = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[2, 0]], [[0, 1], [2, 3]], [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], []]
const JOINED = { 5: [[1, 0], [3, 2]], 10: [[0, 3], [2, 1]] }

function edgeOf(x, y, edge) {
  if (edge === 0) return { key: `h${x},${y}`, from: [x, y], to: [x + 1, y] }
  if (edge === 2) return { key: `h${x},${y + 1}`, from: [x, y + 1], to: [x + 1, y + 1] }
  if (edge === 3) return { key: `v${x},${y}`, from: [x, y], to: [x, y + 1] }
  return { key: `v${x + 1},${y}`, from: [x + 1, y], to: [x + 1, y + 1] }
}

function crossing(values, columns, { from, to }, threshold) {
  const a = values[from[1] * columns + from[0]]
  const b = values[to[1] * columns + to[0]]
  const part = a === b ? 0.5 : (threshold - a) / (b - a)
  return [from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part]
}

function simplified(loop, tolerance) {
  if (loop.length < 4) return loop
  const keep = new Uint8Array(loop.length)
  keep[0] = 1
  keep[loop.length - 1] = 1
  const stack = [[0, loop.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    const [ax, ay] = loop[first]
    const [bx, by] = loop[last]
    const length = Math.hypot(bx - ax, by - ay) || 1
    let far = -1
    let distance = tolerance
    for (let index = first + 1; index < last; index++) {
      const [px, py] = loop[index]
      const away = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
      if (away > distance) {
        far = index
        distance = away
      }
    }
    if (far < 0) continue
    keep[far] = 1
    stack.push([first, far], [far, last])
  }
  return loop.filter((_, index) => keep[index])
}

export function isolines(alpha, columns, rows, threshold, tolerance = 0.25) {
  const width = columns + 2
  const height = rows + 2
  const values = new Float32Array(width * height)
  for (let row = 0; row < rows; row++) values.set(alpha.subarray(row * columns, (row + 1) * columns), (row + 1) * width + 1)
  const next = new Map()
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const above = [values[y * width + x], values[y * width + x + 1], values[(y + 1) * width + x + 1], values[(y + 1) * width + x]].map(value => value > threshold ? 1 : 0)
      const index = above[0] | above[1] << 1 | above[2] << 2 | above[3] << 3
      const centre = (values[y * width + x] + values[y * width + x + 1] + values[(y + 1) * width + x + 1] + values[(y + 1) * width + x]) / 4
      const segments = JOINED[index] && centre > threshold ? JOINED[index] : CASES[index]
      for (const [from, to] of segments) {
        const start = edgeOf(x, y, from)
        next.set(start.key, { point: crossing(values, width, start, threshold), end: edgeOf(x, y, to).key })
      }
    }
  }
  const loops = []
  while (next.size) {
    const [first] = next.keys()
    const loop = []
    let at = first
    while (next.has(at)) {
      const { point, end } = next.get(at)
      next.delete(at)
      loop.push([point[0] - 0.5, point[1] - 0.5])
      at = end
    }
    if (loop.length < 3) continue
    const far = loop.reduce((best, point, index) => Math.hypot(point[0] - loop[0][0], point[1] - loop[0][1]) > Math.hypot(loop[best][0] - loop[0][0], loop[best][1] - loop[0][1]) ? index : best, 0)
    loops.push(simplified(loop.slice(0, far + 1), tolerance).concat(simplified(loop.slice(far).concat([loop[0]]), tolerance).slice(1, -1)))
  }
  return loops.filter(loop => loop.length > 2)
}
