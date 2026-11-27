import { maskReader, rectangles } from "./rectangles.js"

function stretches(from, to, open) {
  const found = []
  for (let at = from; at < to; at++) {
    if (!open(at)) continue
    if (found.at(-1)?.[1] === at) found.at(-1)[1]++
    else found.push([at, at + 1])
  }
  return found
}

export function boxesFor(mask, width, height, originX = 0, originY = 0) {
  const at = maskReader(mask, width, height)
  return rectangles(mask, width, height).map(([x, y, w, h]) => {
    const moved = (found, origin) => found.map(ends => ends.map(end => end + origin))
    return {
      from: [originX + x, originY + y],
      to: [originX + x + w, originY + y + h],
      faces: {
        front: true,
        back: true,
        west: moved(stretches(y, y + h, row => !at(x - 1, row)), originY),
        east: moved(stretches(y, y + h, row => !at(x + w, row)), originY),
        down: moved(stretches(x, x + w, column => !at(column, y - 1)), originX),
        up: moved(stretches(x, x + w, column => !at(column, y + h)), originX)
      },
      internal: { up: y + h !== height, down: y !== 0 }
    }
  })
}

const SIDES = [
  { name: "front", kind: "front", quad: (a, b) => [[a[0], a[1], a[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], a[1], a[2]]] },
  { name: "back", kind: "back", quad: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]] },
  { name: "west", kind: "side", quad: (a, b) => [[a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]]] },
  { name: "east", kind: "side", quad: (a, b) => [[b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]]] },
  { name: "down", kind: "bottom", quad: (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]] },
  { name: "up", kind: "top", quad: (a, b) => [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]]] }
]

function stretched(box, name) {
  const across = { west: 1, east: 1, down: 0, up: 0 }[name]
  if (across === undefined) return box.faces[name] ? [[box.from, box.to]] : []
  return (box.faces[name] ?? []).map(([from, to]) => [box.from.with(across, from), box.to.with(across, to)])
}

export function boxFaces(boxes, zFront, zBack) {
  const out = []
  for (const box of boxes) {
    const solid = { from: box.from.concat(zFront), to: box.to.concat(zBack) }
    for (const { name, kind, quad } of SIDES) {
      for (const [from, to] of stretched(box, name)) out.push({ points: quad([from[0], from[1], zFront], [to[0], to[1], zBack]), kind, name, internal: box.internal[name] ?? false, solid })
    }
  }
  return out
}
