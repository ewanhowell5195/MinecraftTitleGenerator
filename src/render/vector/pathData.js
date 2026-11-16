const PATH_STEP = 10

export function number(value) {
  return String(Math.round(value * 100) / 100)
}

function short(value) {
  return String(value / 100).replace(/^(-?)0\./, "$1.")
}

function pair(x, y) {
  return joined([short(x), short(y)])
}

function hundredths(value) {
  return Math.round(value * 100)
}

function joined(numbers) {
  let text = ""
  for (const value of numbers) {
    const needsGap = text && !value.startsWith("-") && !(value.startsWith(".") && /\.\d*$/.test(text))
    text += needsGap ? ` ${value}` : value
  }
  return text
}

function snapped(loops) {
  return loops.map(loop => {
    const points = loop.map(([x, y]) => [Math.round(x / PATH_STEP) * PATH_STEP, Math.round(y / PATH_STEP) * PATH_STEP])
    return points.filter(([x, y], index) => x !== points.at(index - 1)[0] || y !== points.at(index - 1)[1])
  }).filter(loop => loop.length > 2)
}

function closedByLongestEdge(loop) {
  const lengths = loop.map((point, index) => short(point[0] - loop.at(index - 1)[0]).length + short(point[1] - loop.at(index - 1)[1]).length)
  const start = lengths.reduce((best, length, index) => length > lengths[best] ? index : best, 0)
  return loop.slice(start).concat(loop.slice(0, start))
}

function nearestFirst(loops) {
  const left = loops.slice()
  const ordered = []
  let at = [0, 0]
  while (left.length) {
    let best = 0
    let closest = Infinity
    for (const [index, [[x, y]]] of left.entries()) {
      const distance = Math.abs(x - at[0]) + Math.abs(y - at[1])
      if (distance >= closest) continue
      closest = distance
      best = index
    }
    const [loop] = left.splice(best, 1)
    ordered.push(loop)
    at = loop[0]
  }
  return ordered
}

function stepsOf(loop) {
  const runs = []
  for (const [index, [x, y]] of loop.slice(1).entries()) {
    const dx = x - loop[index][0]
    const dy = y - loop[index][1]
    const command = dy === 0 ? "h" : dx === 0 ? "v" : "l"
    const values = command === "h" ? [dx] : command === "v" ? [dy] : [dx, dy]
    if (runs.at(-1)?.command === command) runs.at(-1).values.push(...values)
    else runs.push({ command, values })
  }
  return runs.map(({ command, values }) => command + joined(values.map(short))).join("")
}

export function writePath(loops) {
  let path = ""
  let fromX = 0
  let fromY = 0
  for (const loop of nearestFirst(snapped(loops).map(closedByLongestEdge))) {
    const [startX, startY] = loop[0]
    path += path ? `m${pair(startX - fromX, startY - fromY)}` : `M${pair(startX, startY)}`
    fromX = startX
    fromY = startY
    path += `${stepsOf(loop)}z`
  }
  return path
}

export function loopsInHundredths(polygons, left, top) {
  return polygons.map(polygon => polygon.map(([x, y]) => [hundredths(x - left), hundredths(y - top)]))
}
