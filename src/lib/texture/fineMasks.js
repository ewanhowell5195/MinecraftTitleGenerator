import { edgeBands, fillSpans, ringEdges } from "../font/fontOutline.js"
import { signedArea } from "../core/maths.js"
import { MITER_LIMIT } from "../geometry/clip.js"
import { faceLimits, liftedRings, ringWalls, rowMapping } from "../geometry/meshFaces.js"

const CORNER_WINDOW = 2
const CORNER_TURN = Math.PI / 3
const SHARP_INSIDE = Math.PI / 6
const SHORTEST_RUN = 1
const SHARP_TURN = Math.PI / 6
const BEND_TURN = Math.PI / 24
const LONG_EDGE = 2
const FACING_SPREAD = 1
const BURIED_FROM = 0.25
const BURIED_TO = 0.5
const SHORTEST_EDGE = 0.1

function scanFill(rings, width, height, scale, bottom) {
  const columns = width * scale
  const rows = height * scale
  const mask = new Uint8Array(columns * rows)
  const near = edgeBands(ringEdges(rings), 1 / scale)
  for (let row = 0; row < rows; row++) {
    const y = bottom + (row + 0.5) / scale
    for (const [left, right] of fillSpans(near(y), y, scale)) {
      const from = Math.max(0, left)
      const to = Math.min(columns, right)
      if (to > from) mask.fill(1, row * columns + from, row * columns + to)
    }
  }
  return mask
}

function edgeDistances(rings, holes, solid, width, height, scale, bottom, reach) {
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows).fill(reach)
  const facing = new Float32Array(columns * rows * 2)
  for (const [ax, ay, bx, by, solidLeft] of rings.flatMap((ring, index) => ringEdges([ring]).map(edge => edge.concat(signedArea(ring) > 0 !== holes[index])))) {
    const x0 = ax * scale
    const y0 = (ay - bottom) * scale
    const dx = bx * scale - x0
    const dy = (by - bottom) * scale - y0
    const length = dx * dx + dy * dy
    const normal = Math.sqrt(length) || 1
    const nx = (solidLeft ? dy : -dy) / normal
    const ny = (solidLeft ? -dx : dx) / normal
    const left = Math.max(0, Math.floor(Math.min(x0, x0 + dx) - reach))
    const right = Math.min(columns - 1, Math.ceil(Math.max(x0, x0 + dx) + reach))
    const low = Math.max(0, Math.floor(Math.min(y0, y0 + dy) - reach))
    const high = Math.min(rows - 1, Math.ceil(Math.max(y0, y0 + dy) + reach))
    for (let row = low; row <= high; row++) {
      const py = row + 0.5 - y0
      for (let column = left; column <= right; column++) {
        const px = column + 0.5 - x0
        const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0
        const ox = px - t * dx
        const oy = py - t * dy
        const distance = Math.hypot(ox, oy)
        const index = row * columns + column
        if (distance < out[index]) {
          out[index] = distance
          const away = distance > 1e-6 ? (solid[index] ? -1 : 1) / distance : 0
          facing[index * 2] = away ? ox * away : nx
          facing[index * 2 + 1] = away ? oy * away : ny
        }
      }
    }
  }
  for (const [index, ring] of rings.entries()) mitreCorners(ring, signedArea(ring) > 0 !== holes[index], solid, out, facing, columns, rows, scale, bottom, reach)
  return { distance: out, facing }
}

function mitreCorners(ring, solidLeft, solid, out, facing, columns, rows, scale, bottom, reach) {
  const points = ring.map(([x, y]) => [x * scale, (y - bottom) * scale])
  const count = points.length
  const extent = reach * MITER_LIMIT
  for (let at = 0; at < count; at++) {
    const [vx, vy] = points[at]
    const [px, py] = points[(at - 1 + count) % count]
    const [qx, qy] = points[(at + 1) % count]
    const [ix, iy] = [vx - px, vy - py]
    const [ox, oy] = [qx - vx, qy - vy]
    const turn = ix * oy - iy * ox
    if (!(solidLeft ? turn < 0 : turn > 0)) continue
    const inLength = Math.hypot(ix, iy)
    const outLength = Math.hypot(ox, oy)
    const normals = [[ix, iy, inLength], [ox, oy, outLength]].map(([x, y, size]) => solidLeft ? [-y / size, x / size] : [y / size, -x / size])
    for (let row = Math.max(0, Math.floor(vy - extent)); row <= Math.min(rows - 1, Math.ceil(vy + extent)); row++) {
      for (let column = Math.max(0, Math.floor(vx - extent)); column <= Math.min(columns - 1, Math.ceil(vx + extent)); column++) {
        const index = row * columns + column
        if (!solid[index]) continue
        const dx = column + 0.5 - vx
        const dy = row + 0.5 - vy
        if (dx * ix + dy * iy <= 0 || dx * ox + dy * oy >= 0) continue
        const sides = normals.map(([nx, ny]) => dx * nx + dy * ny)
        const side = sides[0] >= sides[1] ? 0 : 1
        const distance = Math.max(sides[side], Math.hypot(dx, dy) / MITER_LIMIT)
        if (distance >= out[index]) continue
        out[index] = distance
        facing[index * 2] = -normals[side][0]
        facing[index * 2 + 1] = -normals[side][1]
      }
    }
  }
}

function cornerEdges(ring, solidLeft) {
  const count = ring.length
  const inward = ring.map((point, index) => {
    const before = ring[(index - 1 + count) % count]
    const after = ring[(index + 1) % count]
    const turn = Math.atan2((point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0]), (point[0] - before[0]) * (after[0] - point[0]) + (point[1] - before[1]) * (after[1] - point[1]))
    return (solidLeft ? -turn : turn) > SHARP_INSIDE
  })
  return ring.map((point, index) => point.concat(ring[(index + 1) % count], solidLeft, inward[index], inward[(index + 1) % count]))
}

function longRuns(edges, [tx, ty], least) {
  const facing = edges.map(([ax, ay, bx, by, solidLeft]) => {
    const size = Math.hypot(bx - ax, by - ay)
    return size > 0 && ((solidLeft ? by - ay : ay - by) * tx + (solidLeft ? ax - bx : bx - ax) * ty) / size >= least
  })
  const kept = facing.slice()
  const count = edges.length
  const start = facing.findIndex(value => !value)
  if (start < 0) return kept
  for (let step = 1; step <= count; step++) {
    const index = (start + step) % count
    if (!facing[index] || facing[(index - 1 + count) % count]) continue
    let length = 0
    const run = []
    for (let at = index; facing[at] && run.length < count; at = (at + 1) % count) {
      run.push(at)
      length += Math.hypot(edges[at][2] - edges[at][0], edges[at][3] - edges[at][1])
    }
    if (length < SHORTEST_RUN) for (const at of run) kept[at] = false
  }
  return kept
}

function facingScores(rings, holes, solid, width, height, scale, bottom, [tx, ty], least, reach, score, thickness) {
  const columns = width * scale
  const rows = height * scale
  const out = new Float32Array(columns * rows)
  const walls = []
  const joins = []
  for (const [index, points] of rings.entries()) {
    const ring = []
    for (const point of points) {
      const last = ring.at(-1)
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > SHORTEST_EDGE) ring.push(point)
    }
    while (ring.length > 3 && Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) <= SHORTEST_EDGE) ring.pop()
    const solidLeft = signedArea(ring) > 0 !== holes[index]
    const corners = cornerEdges(ring, solidLeft)
    const kept = longRuns(corners, [tx, ty], least)
    const edges = corners.map(([ax, ay, bx, by]) => [[ax * scale, (ay - bottom) * scale], [bx * scale, (by - bottom) * scale]])
    const count = edges.length
    const lengths = edges.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]))
    const outward = edges.map(([a, b], at) => [(solidLeft ? b[1] - a[1] : a[1] - b[1]) / (lengths[at] || 1), (solidLeft ? a[0] - b[0] : b[0] - a[0]) / (lengths[at] || 1)])
    const raw = outward.map(([x, y]) => Math.max(0, x * tx + y * ty))
    const soft = raw.map((value, at) => kept[at] ? value : Math.min(value, least))
    const turns = edges.map((_, at) => {
      const [[ax, ay], [bx, by]] = edges[(at - 1 + count) % count]
      const [[cx, cy], [dx, dy]] = edges[at]
      return Math.atan2((bx - ax) * (dy - cy) - (by - ay) * (dx - cx), (bx - ax) * (dx - cx) + (by - ay) * (dy - cy))
    })
    const long = lengths.map(size => size > scale * LONG_EDGE)
    const bent = (turn, at) => turn > SHARP_TURN || turn > BEND_TURN && long[at] && long[(at - 1 + count) % count]
    const sharp = turns.map((turn, at) => bent(Math.abs(turn), at))
    const convex = turns.map((turn, at) => bent(solidLeft ? turn : -turn, at))
    const ends = edges.map(() => [])
    const joined = []
    function bandWidth(toward) {
      if (!(toward > least)) return 0
      let low = 0
      let high = reach
      for (let step = 0; step < 24; step++) {
        const middle = (low + high) / 2
        if (score(middle, toward) >= 0.5) low = middle
        else high = middle
      }
      return low
    }
    for (let at = 0; at < count; at++) {
      if (!sharp[at] || convex[at]) continue
      const ahead = at
      const behind = (at - 1 + count) % count
      if (soft[behind] > least && soft[ahead] > least) joined.push(at)
      const [vx, vy] = edges[ahead][0]
      const away = Math.sign((edges[ahead][1][0] - vx) * -ty + (edges[ahead][1][1] - vy) * tx)
      const back = Math.sign((edges[behind][0][0] - vx) * -ty + (edges[behind][0][1] - vy) * tx)
      const behindBand = bandWidth(soft[behind])
      const aheadBand = bandWidth(soft[ahead])
      const forward = [[vx - outward[behind][0] * behindBand, vy - outward[behind][1] * behindBand, ...outward[behind]]].concat(away ? [[vx, vy, -ty * away, tx * away]] : [])
      for (let step = 0, j = ahead; step < count && kept[j] && raw[j] > 0 && (step === 0 || !sharp[j]); step++, j = (j + 1) % count) ends[j].push(...forward)
      const backward = [[vx - outward[ahead][0] * aheadBand, vy - outward[ahead][1] * aheadBand, ...outward[ahead]]].concat(back ? [[vx, vy, -ty * back, tx * back]] : [])
      for (let step = 0, j = behind; step < count && kept[j] && raw[j] > 0 && (step === 0 || !sharp[(j + 1) % count]); step++, j = (j - 1 + count) % count) ends[j].push(...backward)
    }
    for (let at = 0; at < count; at++) {
      if (!long[at] || soft[at] > least) continue
      for (const step of [1, -1]) {
        const curve = []
        let inward = 0
        let j = at
        for (let vertex = step > 0 ? (at + 1) % count : at; !sharp[vertex] && curve.length < count; vertex = step > 0 ? (j + 1) % count : j) {
          inward += solidLeft ? turns[vertex] : -turns[vertex]
          j = (j + step + count) % count
          curve.push(j)
          if (long[j]) break
        }
        if (curve.length < 2 || inward >= 0) continue
        const [vx, vy] = edges[at][step > 0 ? 1 : 0]
        for (const j of curve) ends[j].push([vx, vy, ...outward[at]])
      }
    }
    const rollStart = edges.map(() => null)
    const rollEnd = edges.map(() => null)
    const ceilings = edges.map(() => [])
    for (let at = 0; at < count; at++) {
      if (sharp[at]) continue
      const behind = (at - 1 + count) % count
      const step = lengths[behind] > lengths[at] ? 1 : -1
      const flat = step > 0 ? behind : at
      if (!long[flat] || soft[flat] <= least || lengths[step > 0 ? at : behind] * 2 > lengths[flat]) continue
      const [vx, vy] = edges[at][0]
      const [nx, ny] = outward[flat]
      const [[fx, fy], [gx, gy]] = edges[flat]
      const size = lengths[flat]
      const curve = []
      let rise = 0
      let along = 0
      for (let j = step > 0 ? at : behind; curve.length < count && !long[j] && lengths[j] * 2 <= lengths[flat]; j = (j + step + count) % count) {
        const [px, py] = edges[j][step > 0 ? 1 : 0]
        const higher = -((px - vx) * nx + (py - vy) * ny)
        if (higher <= rise) break
        if (rise < reach) along = Math.abs((px - vx) * (gx - fx) + (py - vy) * (gy - fy)) / size
        rise = higher
        curve.push(j)
        if (sharp[step > 0 ? (j + 1) % count : j]) break
      }
      if (!curve.length) continue
      const roll = { stretch: Math.max(reach, along), lines: curve.map(j => edges[j][0].concat(outward[j])) }
      if (step > 0) rollEnd[flat] = roll
      else rollStart[flat] = roll
      for (const j of curve) ceilings[j].push([vx, vy, nx, ny, soft[flat]])
    }
    const curved = edges.map((_, at) => {
      const before = (at - 1 + count) % count
      const next = (at + 1) % count
      return !long[at] || !sharp[at] && lengths[at] <= 2 * lengths[before] || !sharp[next] && lengths[at] <= 2 * lengths[next]
    })
    const shaped = soft.map((value, at) => curved[at] ? raw[at] : value)
    const curveReach = edges.map(() => 0)
    function spread(group) {
      const levels = group.flatMap(j => [edges[j][0][0] * tx + edges[j][0][1] * ty, edges[j][1][0] * tx + edges[j][1][1] * ty])
      return Math.max(...levels) - Math.min(...levels)
    }
    const firstBreak = edges.findIndex((_, at) => !curved[at] || sharp[at])
    if (firstBreak < 0) curveReach.fill(spread(Array.from(edges.keys())))
    else {
      let group = []
      for (let offset = 0; offset <= count; offset++) {
        const at = (firstBreak + offset) % count
        if (group.length && (offset === count || !curved[at] || sharp[at])) {
          const size = spread(group)
          for (const j of group) curveReach[j] = size
          group = []
        }
        if (offset < count && curved[at]) group.push(at)
      }
    }
    const vertexFacing = outward.map(([x, y], at) => {
      const [bx, by] = outward[(at - 1 + count) % count]
      const size = Math.hypot(x + bx, y + by) || 1
      return (x + bx) / size * tx + (y + by) / size * ty
    })
    const smoothFacing = vertexFacing.map((value, at) => {
      if (sharp[at]) return value
      let total = value
      let weight = 1
      for (const step of [-1, 1]) {
        let spread = 0
        for (let j = at; ;) {
          const edge = step > 0 ? j : (j - 1 + count) % count
          spread += lengths[edge]
          j = (j + step + count) % count
          if (sharp[j] || !curved[edge] || spread > FACING_SPREAD * scale) break
          const falloff = 1 - spread / (FACING_SPREAD * scale)
          total += vertexFacing[j] * falloff
          weight += falloff
        }
      }
      return total / weight
    })
    function facingAt(vertex, edge) {
      if (!sharp[vertex]) return smoothFacing[vertex]
      const [x, y] = outward[edge]
      return x * tx + y * ty
    }
    const stretch = turn => reach / Math.tan(Math.min(Math.abs(turn), Math.PI / 4))
    const ringWalls = edges.map(([a, b], at) => {
      const before = (at - 1 + count) % count
      const next = (at + 1) % count
      const atA = sharp[at] || convex[at] || rollStart[at] ? shaped[at] : (shaped[at] + shaped[before]) / 2
      const atB = sharp[next] || convex[next] || rollEnd[at] ? shaped[at] : (shaped[at] + shaped[next]) / 2
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const size = lengths[at]
      const stretchStart = convex[at] ? stretch(turns[at]) : rollStart[at]?.stretch ?? 0
      const stretchEnd = convex[next] ? stretch(turns[next]) : rollEnd[at]?.stretch ?? 0
      const startLines = convex[at] ? neighbours(before, -1, stretchStart + reach) : rollStart[at]?.lines ?? []
      const endLines = convex[next] ? neighbours(next, 1, stretchEnd + reach) : rollEnd[at]?.lines ?? []
      return size ? { a, dx, dy, ends: ends[at], length: size * size, size, nx: (solidLeft ? dy : -dy) / size, ny: (solidLeft ? -dx : dx) / size, atA, atB, sharpStart: sharp[at], sharpEnd: sharp[next], stretchStart, stretchEnd, startLines, endLines, ceilings: ceilings[at], curved: curved[at], curveStart: !sharp[at] && curved[before], curveEnd: !sharp[next] && curved[next], reach: curveReach[at], least: curved[at] ? 0 : least, faces: raw[at] > 0, facings: [sharp[at] ? facingAt(at, at) : facingAt(before, before), facingAt(at, at), facingAt(next, at), sharp[next] ? facingAt(next, at) : facingAt((next + 1) % count, next)] } : null
    })
    function neighbours(from, step, limit) {
      const lines = []
      let length = 0
      for (let j = from; lines.length < count && length <= limit; j = (j + step + count) % count) {
        lines.push(edges[j][0].concat(outward[j]))
        length += lengths[j]
        if (sharp[step > 0 ? (j + 1) % count : j]) break
      }
      return lines
    }
    walls.push(...ringWalls.filter(Boolean))
    for (const at of joined) {
      const before = ringWalls[(at - 1 + count) % count]
      const after = ringWalls[at]
      if (before && after) joins.push([before, after])
    }
  }
  function coverage(wall, px, py, apex) {
    let keep = 1
    for (const [vx, vy, nx, ny] of wall.ends) if (!apex || vx !== apex[0] || vy !== apex[1]) keep = Math.min(keep, Math.max(0, Math.min(1, (px + wall.a[0] - vx) * nx + (py + wall.a[1] - vy) * ny + 0.5)))
    return keep
  }
  function around(wall, visit, stretched = false) {
    const { a, dx, dy } = wall
    const startBy = stretched ? wall.stretchStart / wall.size : 0
    const endBy = stretched ? 1 + wall.stretchEnd / wall.size : 1
    const xs = [a[0] - dx * startBy, a[0] + dx * endBy]
    const ys = [a[1] - dy * startBy, a[1] + dy * endBy]
    const left = Math.max(0, Math.floor(Math.min(...xs) - reach))
    const right = Math.min(columns - 1, Math.ceil(Math.max(...xs) + reach))
    const low = Math.max(0, Math.floor(Math.min(...ys) - reach))
    const high = Math.min(rows - 1, Math.ceil(Math.max(...ys) + reach))
    for (let row = low; row <= high; row++) {
      for (let column = left; column <= right; column++) {
        const pixel = row * columns + column
        if (!solid[pixel]) continue
        const px = column + 0.5 - a[0]
        const py = row + 0.5 - a[1]
        visit(pixel, px, py, (px * dx + py * dy) / wall.length)
      }
    }
  }
  function ceiling(wall, px, py) {
    let cap = 1
    for (const [vx, vy, nx, ny, toward] of wall.ceilings) cap = Math.min(cap, score(Math.max(0, -((px + wall.a[0] - vx) * nx + (py + wall.a[1] - vy) * ny)), toward))
    return cap
  }
  const hitDistance = new Float32Array(columns * rows).fill(Infinity)
  const hitWall = new Int32Array(columns * rows).fill(-1)
  const hitShare = new Float32Array(columns * rows)
  for (const [index, wall] of walls.entries()) {
    const det = tx * wall.dy - ty * wall.dx
    if (!wall.faces || !det) continue
    around(wall, (pixel, px, py) => {
      const share = (tx * py - ty * px) / det
      const distance = (wall.dx * py - wall.dy * px) / det
      if (share < 0 || share > 1 || distance < -0.5 || distance >= hitDistance[pixel]) return
      hitDistance[pixel] = distance
      hitWall[pixel] = index
      hitShare[pixel] = share
    })
  }
  const curveInset = new Float32Array(columns * rows).fill(NaN)
  const curveKeep = new Float32Array(columns * rows)
  for (const [index, wall] of walls.entries()) {
    const { atA, atB, dx, dy } = wall
    if (!(atA > wall.least || atB > wall.least)) continue
    const steps = atA === atB ? 0 : Math.ceil(wall.size)
    function at(px, py, share) {
      const toward = atA + (atB - atA) * share
      return toward > least ? score(Math.hypot(px - share * dx, py - share * dy), toward) : 0
    }
    around(wall, (pixel, px, py, along) => {
      const keep = coverage(wall, px, py)
      if (!keep) return
      if (wall.curved) {
        if (hitWall[pixel] !== index) return
        const share = hitShare[pixel]
        const [p, a, b, n] = wall.facings
        const facing = Math.min(1, a + share * (b - p + share * (2 * p - 5 * a + 4 * b - n + share * (3 * (a - b) + n - p))) / 2)
        const buried = Math.max(0, Math.min(1, (wall.reach / thickness - BURIED_FROM) / (BURIED_TO - BURIED_FROM)))
        const depth = thickness * buried * buried * (3 - 2 * buried)
        if (!(facing > 0) || !(depth > 0)) return
        curveInset[pixel] = depth * facing - hitDistance[pixel]
        curveKeep[pixel] = Math.min(keep, ceiling(wall, px, py))
        return
      }
      const across = -(px * wall.nx + py * wall.ny)
      const before = along < 0
      const past = along > 1
      let best = 0
      if (before && wall.startLines.length || past && wall.endLines.length) {
        const toward = before ? atA : atB
        let inside = 0
        for (const [vx, vy, nx, ny] of before ? wall.startLines : wall.endLines) inside = Math.max(inside, Math.min(1, 0.5 - ((px + wall.a[0] - vx) * nx + (py + wall.a[1] - vy) * ny)))
        if (across >= 0 && toward > least) best = score(across, toward) * inside
      } else if (!(before && (wall.sharpStart || wall.curveStart) || past && (wall.sharpEnd || wall.curveEnd) || !before && !past && across < 0)) {
        best = at(px, py, Math.max(0, Math.min(1, along)))
        for (let step = 0; steps && step <= steps; step++) best = Math.max(best, at(px, py, step / steps))
      }
      best = Math.min(best * keep, ceiling(wall, px, py))
      if (best > out[pixel]) out[pixel] = best
    }, true)
  }
  function slope(pixel, step, limit) {
    const behind = limit(-step) ? curveInset[pixel - step] : NaN
    const ahead = limit(step) ? curveInset[pixel + step] : NaN
    if (!Number.isNaN(behind) && !Number.isNaN(ahead)) return (ahead - behind) / 2
    if (!Number.isNaN(ahead)) return ahead - curveInset[pixel]
    if (!Number.isNaN(behind)) return curveInset[pixel] - behind
    return 0
  }
  for (let pixel = 0; pixel < curveInset.length; pixel++) {
    const inset = curveInset[pixel]
    if (Number.isNaN(inset) || inset < -2) continue
    const column = pixel % columns
    const row = (pixel - column) / columns
    const gradient = Math.hypot(slope(pixel, 1, step => column + step >= 0 && column + step < columns), slope(pixel, columns, step => row + Math.sign(step) >= 0 && row + Math.sign(step) < rows)) || 1
    const best = Math.max(0, Math.min(1, inset / gradient + 0.5)) * curveKeep[pixel]
    if (best > out[pixel]) out[pixel] = best
  }
  for (const [before, after] of joins) {
    const [ax, ay] = after.a
    const extent = reach * 4
    for (let row = Math.max(0, Math.floor(ay - extent)); row <= Math.min(rows - 1, Math.ceil(ay + extent)); row++) {
      for (let column = Math.max(0, Math.floor(ax - extent)); column <= Math.min(columns - 1, Math.ceil(ax + extent)); column++) {
        const pixel = row * columns + column
        if (!solid[pixel]) continue
        const vx = column + 0.5 - ax
        const vy = row + 0.5 - ay
        const acrossBefore = -(vx * before.nx + vy * before.ny)
        const acrossAfter = -(vx * after.nx + vy * after.ny)
        if (acrossBefore < -0.5 || acrossAfter < -0.5) continue
        const keep = Math.min(coverage(before, column + 0.5 - before.a[0], row + 0.5 - before.a[1], after.a), coverage(after, vx, vy, after.a))
        const best = keep * Math.min(score(Math.max(0, acrossBefore), before.atB), score(Math.max(0, acrossAfter), after.atA))
        if (best > out[pixel]) out[pixel] = best
      }
    }
  }
  return out
}

function wallSpans(rings, kind, top, bottom, reach, limits) {
  const spans = new Map()
  for (const ring of rings) {
    for (const face of ringWalls(ring, 0, 0, top, bottom, reach, limits)) {
      if (face.kind !== kind || face.internal) continue
      const xs = face.points.map(point => point[0])
      const span = spans.get(face.run) ?? [Infinity, -Infinity]
      spans.set(face.run, [Math.min(span[0], ...xs), Math.max(span[1], ...xs)])
    }
  }
  return Array.from(spans.values()).sort((a, b) => a[0] - b[0])
}

export function fineMasks(mesh, glyph, original, reach, limits = faceLimits()) {
  const masks = new Map()
  const distances = new Map()
  let rings = null
  const lifted = () => rings ??= liftedRings(mesh.shapes, rowMapping(glyph, original), glyph.inkShift ?? 0)
  function fine(scale) {
    if (!masks.has(scale)) masks.set(scale, scanFill(lifted(), glyph.width, glyph.height, scale, glyph.bottom))
    return masks.get(scale)
  }
  const holes = mesh.shapes.flatMap(shape => [false].concat(shape.holes.map(() => true)))
  function nearest(scale, reach) {
    const key = `${scale}:${reach}`
    if (!distances.has(key)) distances.set(key, edgeDistances(lifted(), holes, fine(scale), glyph.width, glyph.height, scale, glyph.bottom, reach))
    return distances.get(key)
  }
  fine.distance = (scale, reach) => nearest(scale, reach).distance
  fine.facing = (scale, reach) => nearest(scale, reach).facing
  let corners = null
  fine.corners = () => corners ??= outlineCorners(lifted(), holes)
  const spans = {}
  fine.edgeRuns = side => spans[side] ??= wallSpans(lifted(), side === "up" ? "top" : "bottom", glyph.bottom + glyph.height, glyph.bottom, reach, limits)
  fine.toward = (scale, dx, dy, least, reach, score, thickness) => facingScores(lifted(), holes, fine(scale), glyph.width, glyph.height, scale, glyph.bottom, [dx, dy], least, reach, score, thickness)
  return fine
}

function ringCorners(points, solidLeft) {
  const ring = points.filter((point, index) => {
    const next = points[(index + 1) % points.length]
    return point[0] !== next[0] || point[1] !== next[1]
  })
  const count = ring.length
  if (count < 3) return []
  const at = index => ring[(index % count + count) % count]
  const steps = ring.map((point, index) => Math.hypot(at(index + 1)[0] - point[0], at(index + 1)[1] - point[1]))
  const turns = ring.map((point, index) => {
    const before = at(index - 1)
    const after = at(index + 1)
    let turn = Math.atan2(after[1] - point[1], after[0] - point[0]) - Math.atan2(point[1] - before[1], point[0] - before[0])
    if (turn > Math.PI) turn -= 2 * Math.PI
    if (turn <= -Math.PI) turn += 2 * Math.PI
    return solidLeft ? turn : -turn
  })
  function walked(index, direction, length) {
    let point = ring[index]
    let left = length
    for (let step = 0; step < count; step++) {
      const from = index + step * direction
      const span = steps[((direction > 0 ? from : from - 1) % count + count) % count]
      const next = at(from + direction)
      if (span >= left) return [point[0] + (next[0] - point[0]) * left / span, point[1] + (next[1] - point[1]) * left / span]
      left -= span
      point = next
    }
    return point
  }
  function windowTurn(index) {
    let sum = turns[index]
    for (const direction of [-1, 1]) {
      let length = 0
      for (let step = 1; step < count; step++) {
        length += steps[((direction > 0 ? index + step - 1 : index - step) % count + count) % count]
        if (length > CORNER_WINDOW / 2) break
        sum += turns[((index + step * direction) % count + count) % count]
      }
    }
    return sum
  }
  const sums = ring.map((_, index) => windowTurn(index))
  const corners = []
  for (let index = 0; index < count; index++) {
    if (sums[index] < CORNER_TURN) continue
    let peak = true
    let length = 0
    for (let step = 1; step < count && peak; step++) {
      length += steps[(index + step - 1) % count]
      if (length > CORNER_WINDOW) break
      if (sums[(index + step) % count] > sums[index]) peak = false
    }
    length = 0
    for (let step = 1; step < count && peak; step++) {
      length += steps[((index - step) % count + count) % count]
      if (length > CORNER_WINDOW) break
      if (sums[((index - step) % count + count) % count] >= sums[index]) peak = false
    }
    if (!peak) continue
    const [x, y] = ring[index]
    const [bx, by] = walked(index, -1, CORNER_WINDOW)
    const [ax, ay] = walked(index, 1, CORNER_WINDOW)
    const back = Math.hypot(bx - x, by - y)
    const ahead = Math.hypot(ax - x, ay - y)
    if (!back || !ahead) continue
    const u = [(bx - x) / back, (by - y) / back]
    const w = [(ax - x) / ahead, (ay - y) / ahead]
    const middle = Math.hypot(u[0] + w[0], u[1] + w[1])
    if (!middle) continue
    corners.push({ x, y, inward: [(u[0] + w[0]) / middle, (u[1] + w[1]) / middle], angle: Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1]))) })
  }
  return corners
}

function outlineCorners(rings, holes) {
  return rings.flatMap((ring, index) => ringCorners(ring, signedArea(ring) > 0 !== holes[index]))
}
