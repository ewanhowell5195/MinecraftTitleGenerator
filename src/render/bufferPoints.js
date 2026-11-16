import * as THREE from "three"

const boxes = new WeakMap()
const points = new WeakMap()

export function boxOf(buffers) {
  if (!boxes.has(buffers)) boxes.set(buffers, new THREE.Box3().setFromPoints(pointsOf(buffers)))
  return boxes.get(buffers)
}

export function pointsOf(buffers) {
  if (!points.has(buffers)) {
    const unique = new Map()
    const { positions } = buffers
    for (let at = 0; at < positions.length; at += 3) unique.set(`${positions[at]},${positions[at + 1]},${positions[at + 2]}`, at)
    points.set(buffers, Array.from(unique.values(), at => new THREE.Vector3(positions[at], positions[at + 1], positions[at + 2])))
  }
  return points.get(buffers)
}

export function opaquePoints(runs) {
  if (!points.has(runs)) points.set(runs, runs.flatMap(run => run.corners.map(([x, y, z]) => new THREE.Vector3(x, y, z))))
  return points.get(runs)
}
