function segments(row) {
  const list = []
  let start = -1
  for (let x = 0; x <= row.length; x++) {
    if (x < row.length && row[x]) {
      if (start < 0) start = x
    } else if (start >= 0) {
      list.push([start, x])
      start = -1
    }
  }
  return list
}

function runWidths(all) {
  const list = []
  for (const glyph of all) {
    for (let y = 0; y < glyph.height; y++) {
      for (const [from, to] of segments(glyph.mask.subarray(y * glyph.width, (y + 1) * glyph.width))) list.push(to - from)
    }
  }
  return list
}

function strokeWidth(all) {
  const tally = new Map()
  for (const width of all) tally.set(width, (tally.get(width) ?? 0) + 1)
  return Array.from(tally).sort((a, b) => b[1] - a[1])[0][0]
}

function blockSize(all, stroke) {
  for (let size = stroke; size > 1; size--) {
    if (stroke % size === 0 && all.filter(width => width % size === 0).length >= all.length * 0.95) return size
  }
  return 1
}

function mainBody(glyph) {
  const { width, height, mask } = glyph
  const label = new Int32Array(width * height).fill(-1)
  const sizes = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue
    const stack = [start]
    label[start] = sizes.length
    let size = 0
    while (stack.length) {
      const at = stack.pop()
      size++
      const x = at % width
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
        if (x + dx < 0 || x + dx >= width) continue
        const next = at + dy * width + dx
        if (next < 0 || next >= mask.length || !mask[next] || label[next] >= 0) continue
        label[next] = sizes.length
        stack.push(next)
      }
    }
    sizes.push(size)
  }
  const largest = sizes.indexOf(Math.max(...sizes))
  const spans = sizes.map(() => [Infinity, -Infinity])
  for (let index = 0; index < mask.length; index++) {
    if (label[index] < 0) continue
    const span = spans[label[index]]
    const y = Math.floor(index / width)
    span[0] = Math.min(span[0], y)
    span[1] = Math.max(span[1], y)
  }
  const main = spans[largest]
  const kept = spans.map(([from, to]) => from <= main[1] && to >= main[0])
  return mask.map((value, index) => value && kept[label[index]] ? 1 : 0)
}

function filled(row, [from, to]) {
  return row.subarray(Math.max(0, from - 1), to + 1).some(Boolean)
}

function contains(outer, inner) {
  return outer[0] <= inner[0] && outer[1] >= inner[1] && (outer[0] < inner[0] || outer[1] > inner[1])
}

function direction(a, b) {
  const shifts = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])]
  return shifts[0] * shifts[1] < 0 ? null : shifts[0] || shifts[1]
}

function range(from, to) {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index)
}

function rowOf(glyph, mask, y) {
  return y < glyph.bottom || y >= glyph.top ? new Uint8Array(glyph.width) : mask.subarray((y - glyph.bottom) * glyph.width, (y - glyph.bottom + 1) * glyph.width)
}

function partialMarks(glyph, capHeight) {
  const tall = Math.min(glyph.top, capHeight) - Math.max(glyph.bottom, 0) >= capHeight * 3 / 4 && range(glyph.bottom, glyph.top - 1).every(y => rowOf(glyph, glyph.mask, y).some(Boolean))
  if (!(glyph.bottom > 0 || glyph.top < capHeight && !(tall && glyph.bottom <= 0))) return null
  const anchored = glyph.bottom <= 0 || glyph.top >= capHeight
  return range(0, capHeight - 1).filter(y => anchored ? !rowOf(glyph, glyph.mask, y).some(Boolean) : y < glyph.bottom || y >= glyph.top)
}

function rowRuns(glyph, body, { capHeight, stroke }) {
  const runs = []
  for (let y = 0; y < capHeight; y++) {
    const parts = segments(rowOf(glyph, body, y))
    const key = JSON.stringify(parts)
    const last = runs[runs.length - 1]
    if (last && last.key === key) last.to = y
    else runs.push({ key, parts, from: y, to: y })
  }
  const tally = new Map()
  for (const run of runs) {
    for (const [from, to] of run.parts) if (to - from < stroke * 2) tally.set(to - from, (tally.get(to - from) ?? 0) + run.to - run.from + 1)
  }
  const own = Array.from(tally.keys()).some(width => width <= stroke) ? stroke : Array.from(tally).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? stroke
  for (const run of runs) {
    const widest = Math.max(0, ...run.parts.map(([from, to]) => to - from))
    run.kind = !run.parts.length ? "empty" : widest <= own ? "straight" : widest >= own * 2 ? "bar" : "joint"
    run.attached = run.from === 0 && run.parts.some(part => filled(rowOf(glyph, body, -1), part)) || run.to === capHeight - 1 && run.parts.some(part => filled(rowOf(glyph, body, capHeight), part))
  }
  return runs
}

function chainOf(runs, start, block) {
  if (runs[start].kind === "bar") return null
  const members = [runs[start]]
  let heading = 0
  for (let i = start + 1; i < runs.length; i++) {
    if (runs[i].parts.length !== 1 || runs[i].kind === "bar") break
    const step = direction(members[members.length - 1].parts[0], runs[i].parts[0])
    if (step === null || heading && step && step !== heading) break
    heading ||= step
    members.push(runs[i])
  }
  const first = members[0].parts[0]
  const last = members[members.length - 1].parts[0]
  const moved = [last[0] - first[0], last[1] - first[1]]
  if (members.length < 2 || !moved[0] || !moved[1] || Math.sign(moved[0]) !== Math.sign(moved[1])) return null
  if (Math.min(Math.abs(moved[0]), Math.abs(moved[1])) <= block) return null
  if (members.filter(run => run.kind === "straight").length < 2) return null
  if (members.length > 2 && members.slice(1, -1).every(run => run.kind !== "straight")) return null
  return members
}

function stretchZones(glyph, body, runs, block) {
  const zones = []
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].parts.length !== 1) continue
    const chain = chainOf(runs, i, block)
    if (!chain) continue
    const top = chain[chain.length - 1]
    const capped = runs[runs.indexOf(top) + 1]?.parts.length
    const edge = top.parts[0][0] === 0 || top.parts[0][1] === glyph.width
    const members = capped && edge ? chain.slice(0, -1) : chain
    for (const run of chain) run.chained = true
    zones.push({ runs: members, from: members[0].from, to: members[members.length - 1].to })
    i = runs.indexOf(top)
  }
  for (const run of runs) if (run.kind === "straight" && !run.chained && !run.attached) zones.push({ runs: [run], from: run.from, to: run.to })
  for (const zone of zones) {
    const top = zone.runs[zone.runs.length - 1]
    const bottom = zone.runs[0]
    zone.start = zone.from
    zone.end = zone.to
    if (top.parts.some(part => !filled(rowOf(glyph, body, zone.to + 1), part)) && zone.end - zone.start + 1 > block) zone.end -= block
    const hanging = bottom.parts.filter(part => !filled(rowOf(glyph, body, zone.from - 1), part)).length
    if (zone.from > 0 && hanging && hanging < bottom.parts.length) zone.start += block
    zone.length = zone.end - zone.start + 1
  }
  return zones.filter(zone => zone.length > 0)
}

function fallbackMarks(glyph, runs) {
  const spare = runs.filter(run => !run.attached && (run.kind === "joint" || run.kind === "bar" && !(run.parts.length === 1 && run.parts[0][0] === 0 && run.parts[0][1] === glyph.width)))
  const fallback = spare.sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from)[0]
  return fallback ? range(fallback.from, fallback.to) : []
}

function isPoint(runs, zone) {
  if (zone.runs.length !== 1) return false
  const next = runs[runs.indexOf(zone.runs[0]) + 1]
  if (!next || next.kind === "bar" || next.parts.length !== zone.runs[0].parts.length) return false
  return next.parts.every((part, index) => contains(part, zone.runs[0].parts[index]))
}

function isSymmetric(glyph, body, capHeight) {
  for (let y = 0; y < capHeight; y++) if (JSON.stringify(segments(rowOf(glyph, body, y))) !== JSON.stringify(segments(rowOf(glyph, body, capHeight - 1 - y)))) return false
  return true
}

function middleBar(runs, capHeight) {
  const bars = runs.filter(run => run.kind === "bar" && !run.chained && (run.from + run.to + 1) / 2 >= capHeight / 4 && (run.from + run.to + 1) / 2 <= capHeight * 3 / 4)
  return bars.sort((a, b) => Math.abs((a.from + a.to + 1) / 2 - capHeight / 2) - Math.abs((b.from + b.to + 1) / 2 - capHeight / 2) || b.from - a.from)[0]
}

export function marksFor(glyph, { capHeight, stroke, block }) {
  const partial = partialMarks(glyph, capHeight)
  if (partial) return partial
  const body = mainBody(glyph)
  const runs = rowRuns(glyph, body, { capHeight, stroke })
  const usable = stretchZones(glyph, body, runs, block)
  if (!usable.length) return fallbackMarks(glyph, runs)
  const middle = middleBar(runs, capHeight)
  const centred = middle && middle.from + middle.to + 1 === capHeight
  let candidates = usable
  if (middle) {
    const below = usable.filter(zone => zone.to < middle.from && !isPoint(runs, zone))
    candidates = below.length ? below : usable.filter(zone => zone.from > middle.to)
  }
  const chosen = candidates.slice().sort((a, b) => b.length - a.length || a.from - b.from)[0]
  if (!chosen) return []
  const picked = [chosen]
  if (!/[\p{L}\p{N}]/u.test(glyph.char) && !centred && isSymmetric(glyph, body, capHeight)) {
    const mirror = new Set(range(chosen.from, chosen.to).map(y => capHeight - 1 - y))
    picked.push(...usable.filter(zone => zone !== chosen && (zone.runs.length === 1 && chosen.runs.length === 1 && zone.runs[0].key === chosen.runs[0].key || range(zone.from, zone.to).some(y => mirror.has(y)))))
  }
  return picked.flatMap(zone => range(zone.start, zone.end)).sort((a, b) => a - b)
}

export function sheetMeasures(cells) {
  const widths = runWidths(cells)
  const stroke = widths.length ? strokeWidth(widths) : 1
  return { stroke, block: blockSize(widths, stroke) }
}
