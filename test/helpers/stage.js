import assert from "node:assert/strict"
import * as THREE from "three"
import { placementMatrix } from "#render/placement.js"
import { close } from "./assert.js"

export const BOUNDS = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 4, 2))
export const WIDE = new THREE.Box3(new THREE.Vector3(-30, 0, 0), new THREE.Vector3(30, 20, 10))

export function closeList(actual, expected, tolerance = 1e-6) {
  const list = actual.toArray ? actual.toArray() : actual
  assert.equal(list.length, expected.length)
  for (const [index, value] of list.entries()) close(value, expected[index], tolerance)
}

export function radians(degrees) {
  return degrees * Math.PI / 180
}

export function point(x, y, z) {
  return new THREE.Vector3(x, y, z)
}

export function transform(overrides) {
  return { rotation: 0, offset: [0, 0, 0], type: [1, 1, 1], scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0], anchor: { y: "middle", z: "middle" }, outlineGrow: [1, 1, 1], word: { scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0] }, ...overrides }
}

export function builtOf(min, max, lineMin = min, lineMax = max) {
  return { line: { min: lineMin, max: lineMax }, body: { triangles: 2, positions: new Float32Array(min.concat(max)) } }
}

export function moved(position, value) {
  return position.clone().applyMatrix4(placementMatrix(value, BOUNDS))
}

export function middle(corners) {
  return corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(corners.length)
}
