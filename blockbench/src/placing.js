import * as THREE from "three"
import { gizmoPose, lineBounds, placementMatrix, wordPose } from "../../src/render/placement.js"
import { TYPE_ROTATIONS, TYPE_SCALES } from "../../src/lib/geometry/placement.js"

// the site's titles face +z, and Blockbench models face north, which is -z
export const FACING = new THREE.Matrix4().makeRotationY(Math.PI)

const FACING_TURN = new THREE.Quaternion().setFromRotationMatrix(FACING)
const WORD_POSITION = ["wordTranslateX", "wordTranslateY", "wordTranslateZ"]
const WORD_ROTATION = ["wordRotationX", "wordRotationY", "wordRotationZ"]

const tidy = value => Math.roundTo(value, 4) + 0

function tilt(type) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.degToRad(TYPE_ROTATIONS[type]))
}

function frame({ type }) {
  return FACING_TURN.clone().multiply(tilt(type))
}

function lineScale({ type, scaleX, scaleY, scaleZ }) {
  return new THREE.Vector3(...TYPE_SCALES[type]).multiply(new THREE.Vector3(scaleX, scaleY, scaleZ))
}

function eulerOf([x, y, z], order) {
  return new THREE.Euler(Math.degToRad(x), Math.degToRad(y), Math.degToRad(z), order)
}

function degrees(quaternion, order) {
  const { x, y, z } = new THREE.Euler().setFromQuaternion(quaternion, order)
  return [x, y, z].map(angle => tidy(Math.radToDeg(angle)))
}

function nativeTurn(rotation) {
  return new THREE.Quaternion().setFromEuler(eulerOf(rotation, Format.euler_order))
}

export function wordTransform(settings, position, rotation) {
  const turn = frame(settings)
  const translate = new THREE.Vector3(...position).applyQuaternion(turn.clone().invert()).divide(lineScale(settings)).toArray().map(tidy)
  const turned = degrees(turn.clone().invert().multiply(nativeTurn(rotation)).multiply(turn), "XYZ")
  return Object.fromEntries(WORD_POSITION.map((key, axis) => [key, translate[axis]]).concat(WORD_ROTATION.map((key, axis) => [key, turned[axis]])))
}

export function nativePosition(settings) {
  return new THREE.Vector3(...WORD_POSITION.map(key => settings[key])).multiply(lineScale(settings)).applyQuaternion(frame(settings)).toArray().map(tidy)
}

export function pivotOf({ built, transform }) {
  if (!built) return new THREE.Vector3()
  return gizmoPose(transform, lineBounds(built)).position.applyMatrix4(FACING)
}

function still(transform) {
  return { ...transform, word: { ...transform.word, translate: [0, 0, 0] } }
}

export function wordCentre({ built, transform }, pivot) {
  if (!built?.body.triangles) return new THREE.Vector3()
  return wordPose(still(transform), built, false).position.applyMatrix4(FACING).sub(pivot)
}

export function wordOffset({ built, transform }, settings) {
  if (!built) return new THREE.Vector3()
  const spread = new THREE.Matrix3().setFromMatrix4(FACING.clone().multiply(placementMatrix(transform, lineBounds(built))))
  return new THREE.Vector3(...WORD_POSITION.map(key => settings[key])).applyMatrix3(spread)
}

export function wordMatrix({ built, transform }, pivot) {
  if (!built?.body.triangles) return new THREE.Matrix4()
  const { position, quaternion } = wordPose(transform, built, true)
  const still = wordPose(transform, built, false).quaternion
  const turn = FACING_TURN.clone().multiply(quaternion).multiply(still.invert()).multiply(FACING_TURN.clone().invert())
  return new THREE.Matrix4().compose(position.applyMatrix4(FACING).sub(pivot), turn, new THREE.Vector3(1, 1, 1))
}
