import * as THREE from "three"

const boxes = new WeakMap()
const points = new WeakMap()
const NEGATIVE_ZERO = 0x80000000

export function boxOf(buffers) {
  if (!boxes.has(buffers)) boxes.set(buffers, new THREE.Box3().setFromPoints(pointsOf(buffers)))
  return boxes.get(buffers)
}

export function pointsOf(buffers) {
  if (!points.has(buffers)) points.set(buffers, uniquePoints(buffers.positions))
  return points.get(buffers)
}

function uniquePoints(positions) {
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, positions.length)
  const word = at => bits[at] === NEGATIVE_ZERO ? 0 : bits[at]
  const size = 2 ** Math.ceil(Math.log2(positions.length / 3 * 2 + 1))
  const slots = new Int32Array(size).fill(-1)
  const found = []
  for (let at = 0; at < positions.length; at += 3) {
    const x = word(at)
    const y = word(at + 1)
    const z = word(at + 2)
    let slot = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (size - 1)
    while (slots[slot] !== -1 && (word(slots[slot]) !== x || word(slots[slot] + 1) !== y || word(slots[slot] + 2) !== z)) slot = (slot + 1) & (size - 1)
    if (slots[slot] !== -1) continue
    slots[slot] = at
    found.push(new THREE.Vector3(positions[at], positions[at + 1], positions[at + 2]))
  }
  return found
}

export function opaquePoints(runs) {
  if (!points.has(runs)) points.set(runs, runs.flatMap(run => run.corners.map(([x, y, z]) => new THREE.Vector3(x, y, z))))
  return points.get(runs)
}
