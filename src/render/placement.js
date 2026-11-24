import * as THREE from "three"
import { radians, round } from "../lib/core/maths.js"
import { boxOf } from "./bufferPoints.js"

function euler(degrees) {
  return new THREE.Euler(...degrees.map(radians))
}

function around(matrix, point, transform) {
  return matrix.multiply(new THREE.Matrix4().makeTranslation(point.x, point.y, point.z)).multiply(transform).multiply(new THREE.Matrix4().makeTranslation(-point.x, -point.y, -point.z))
}

export function lineBounds(built) {
  return new THREE.Box3(new THREE.Vector3(...built.line.min), new THREE.Vector3(...built.line.max))
}

function anchorOf(value, bounds, centre) {
  const anchor = centre.clone()
  anchor.y = { bottom: bounds.min.y, top: bounds.max.y }[value.anchor.y] ?? centre.y
  anchor.z = { back: bounds.min.z, front: bounds.max.z }[value.anchor.z] ?? centre.z
  return anchor
}

export function placementMatrix(value, bounds) {
  const placement = new THREE.Matrix4().makeRotationX(radians(value.rotation))
  const base = placement.clone().multiply(new THREE.Matrix4().makeTranslation(...value.offset)).multiply(new THREE.Matrix4().makeScale(...value.type))
  const centre = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3()
  const anchor = bounds ? anchorOf(value, bounds, centre) : centre.clone()
  centre.applyMatrix4(base)
  anchor.applyMatrix4(base)
  const scale = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z).multiply(placement).multiply(new THREE.Matrix4().makeScale(...value.scale)).multiply(placement.clone().invert()).multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z))
  centre.applyMatrix4(scale)
  const rotation = new THREE.Matrix4().makeRotationFromEuler(euler(value.rotate))
  const translate = new THREE.Vector3(value.translate[0] + (value.matchOffset ?? 0), value.translate[1], value.translate[2]).applyMatrix4(rotation.clone().multiply(placement))
  return around(new THREE.Matrix4().makeTranslation(translate.x, translate.y, translate.z), centre, rotation).multiply(scale).multiply(base)
}

function wordParts(value, built) {
  const bounds = built.plain ? new THREE.Box3(new THREE.Vector3(...built.plain.min), new THREE.Vector3(...built.plain.max)) : boxOf(built.body)
  const centre = bounds.getCenter(new THREE.Vector3())
  const anchor = anchorOf(value, bounds, centre)
  const scale = around(new THREE.Matrix4(), anchor, new THREE.Matrix4().makeScale(...value.word.scale))
  return { scale, centre: centre.applyMatrix4(scale) }
}

function wordMatrix(value, built) {
  const word = value.word
  if (!word || !built?.body.triangles || word.scale.every(axis => axis === 1) && word.rotate.every(angle => !angle) && word.translate.every(axis => !axis)) return new THREE.Matrix4()
  const { scale, centre } = wordParts(value, built)
  const lineScale = value.type.map((axis, index) => axis * value.scale[index])
  const rotation = new THREE.Matrix4().makeScale(...lineScale.map(axis => 1 / axis)).multiply(new THREE.Matrix4().makeRotationFromEuler(euler(word.rotate))).multiply(new THREE.Matrix4().makeScale(...lineScale))
  return around(new THREE.Matrix4().makeTranslation(...word.translate), centre, rotation).multiply(scale)
}

export function objectMatrix(value, built) {
  return placementMatrix(value, built && lineBounds(built)).multiply(wordMatrix(value, built))
}

function wrap(degrees) {
  return degrees - 360 * Math.round(degrees / 360)
}

function orientation(rotate, rotation) {
  return new THREE.Quaternion().setFromEuler(euler(rotate)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), radians(rotation)))
}

export function gizmoPose(value, bounds) {
  return {
    position: bounds.getCenter(new THREE.Vector3()).applyMatrix4(placementMatrix(value, bounds)),
    quaternion: orientation(value.rotate, value.rotation)
  }
}

function limited(translate) {
  return translate.map(axis => round(axis, 2))
}

export function movedBy(value, offset) {
  const turn = orientation(value.rotate, value.rotation)
  const local = offset.clone().applyQuaternion(turn.clone().invert())
  const translate = limited(value.translate.map((axis, index) => axis + local.getComponent(index)))
  return { translate, offset: new THREE.Vector3(...translate).sub(new THREE.Vector3(...value.translate)).applyQuaternion(turn) }
}

function nearestAngles(quaternion, previous) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion)
  const first = [euler.x, euler.y, euler.z].map(angle => angle * 180 / Math.PI)
  const second = [first[0] + 180, 180 - first[1], first[2] + 180].map(wrap)
  const distance = angles => angles.reduce((sum, angle, index) => sum + Math.abs(wrap(angle - previous[index])), 0)
  return (distance(first) <= distance(second) ? first : second).map(angle => round(angle, 2))
}

export function wordPose(value, built, turned) {
  const quaternion = orientation(value.rotate, value.rotation)
  if (turned) quaternion.multiply(new THREE.Quaternion().setFromEuler(euler(value.word.rotate)))
  return { position: wordParts(value, built).centre.add(new THREE.Vector3(...value.word.translate)).applyMatrix4(placementMatrix(value, lineBounds(built))), quaternion }
}

export function wordMovedBy(value, built, offset) {
  const matrix = placementMatrix(value, lineBounds(built))
  const local = offset.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix).invert())
  const translate = limited(value.word.translate.map((axis, index) => axis + local.getComponent(index)))
  return { translate, position: wordParts(value, built).centre.add(new THREE.Vector3(...translate)).applyMatrix4(matrix) }
}

export function wordRotatedTo(value, quaternion) {
  return nearestAngles(orientation(value.rotate, value.rotation).invert().multiply(quaternion), value.word.rotate)
}

export function rotatedTo(value, quaternion) {
  const placement = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), radians(value.rotation))
  const rotate = nearestAngles(quaternion.clone().multiply(placement.invert()), value.rotate)
  const world = new THREE.Vector3(...value.translate).applyQuaternion(orientation(value.rotate, value.rotation))
  const translate = limited(world.applyQuaternion(orientation(rotate, value.rotation).invert()).toArray())
  return { rotate, translate }
}
