import { furthestKept } from "./colours.js"

const STAIR = 0.8
const STAIR_POINTS = 6

export function trace(mask, width, height) {
  const outgoing = new Map()
  function add(fromX, fromY, toX, toY) {
    const key = fromY * (width + 1) + fromX
    if (!outgoing.has(key)) outgoing.set(key, [])
    outgoing.get(key).push([toX, toY])
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      if (y === 0 || !mask[(y - 1) * width + x]) add(x, y, x + 1, y)
      if (x === width - 1 || !mask[y * width + x + 1]) add(x + 1, y, x + 1, y + 1)
      if (y === height - 1 || !mask[(y + 1) * width + x]) add(x + 1, y + 1, x, y + 1)
      if (x === 0 || !mask[y * width + x - 1]) add(x, y + 1, x, y)
    }
  }
  const loops = []
  for (const [start, list] of outgoing) {
    while (list.length) {
      const loop = []
      let x = start % (width + 1)
      let y = Math.floor(start / (width + 1))
      let key = start
      do {
        loop.push([x, y])
        const [nextX, nextY] = outgoing.get(key).pop()
        x = nextX
        y = nextY
        key = y * (width + 1) + x
      } while (key !== start)
      loops.push(loop.filter((point, index) => {
        const before = loop[(index + loop.length - 1) % loop.length]
        const after = loop[(index + 1) % loop.length]
        return (point[0] - before[0]) * (after[1] - point[1]) !== (point[1] - before[1]) * (after[0] - point[0])
      }))
    }
  }
  return loops
}

function simplifyRun(run) {
  return furthestKept(run, STAIR, ([x, y], [ax, ay], [bx, by]) => Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / (Math.hypot(bx - ax, by - ay) || 1))
}

function monotoneRuns(run) {
  const runs = []
  let from = 0
  let stepX = 0
  let stepY = 0
  for (let index = 1; index < run.length; index++) {
    const dx = Math.sign(run[index][0] - run[index - 1][0])
    const dy = Math.sign(run[index][1] - run[index - 1][1])
    if (dx && stepX && dx !== stepX || dy && stepY && dy !== stepY) {
      runs.push(run.slice(from, index))
      from = index - 1
      stepX = 0
      stepY = 0
    }
    stepX ||= dx
    stepY ||= dy
  }
  runs.push(run.slice(from))
  return runs
}

export function smoothStairs(loop) {
  const size = loop.length
  const unit = loop.map((point, index) => {
    const next = loop[(index + 1) % size]
    return Math.abs(next[0] - point[0]) + Math.abs(next[1] - point[1]) === 1
  })
  const inRun = index => unit[index] || unit[(index + size - 1) % size]
  const start = loop.findIndex((point, index) => !inRun(index))
  if (start < 0 || !unit.includes(true)) return loop
  const result = []
  let run = []
  function finish() {
    for (const [index, piece] of monotoneRuns(run).entries()) {
      const points = piece.length >= STAIR_POINTS ? [piece[0]].concat(simplifyRun(piece.slice(1).map((point, at) => [(point[0] + piece[at][0]) / 2, (point[1] + piece[at][1]) / 2])), [piece.at(-1)]) : piece
      result.push(...points.slice(index ? 1 : 0))
    }
    run = []
  }
  for (let offset = 0; offset < size; offset++) {
    const index = (start + offset) % size
    if (inRun(index)) {
      run.push(loop[index])
      continue
    }
    finish()
    result.push(loop[index])
  }
  finish()
  return result
}
