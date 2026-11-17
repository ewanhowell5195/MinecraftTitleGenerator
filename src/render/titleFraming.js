import * as THREE from "three"
import { DEFAULT_CAMERA } from "../lib/settings/camera.js"
import { radians } from "../lib/core/maths.js"
import { boxOf, opaquePoints, pointsOf } from "./bufferPoints.js"
import { lineBounds, objectMatrix, placementMatrix } from "./placement.js"

const TITLE_REACH = 144

function localBounds(item, grow) {
  const body = boxOf(item.built.body)
  const bounds = body.clone()
  const shell = item.halo?.triangles ? item.halo : item.outline
  if (shell?.triangles) {
    const outline = boxOf(shell).clone()
    const scale = new THREE.Vector3(...shell.scale)
    const factor = new THREE.Vector3(...grow)
    outline.min.divide(scale)
    outline.max.divide(scale)
    bounds.union(new THREE.Box3(body.min.clone().sub(body.min.clone().sub(outline.min).multiply(factor)), body.max.clone().add(outline.max.clone().sub(body.max).multiply(factor))))
  }
  return bounds
}

function placedPoints(item, transform) {
  const matrix = objectMatrix(transform, item.built)
  const shell = item.halo?.triangles ? item.halo : item.outline
  const outline = shell?.triangles ? pointsOf(shell).map(point => point.clone().divide(new THREE.Vector3(...shell.scale))) : []
  return (item.built.runs ? opaquePoints(item.built.runs) : pointsOf(item.built.body)).concat(outline).map(point => point.clone().applyMatrix4(matrix))
}

function restBounds(item) {
  const bounds = localBounds(item, item.transform.outlineGrow)
  return bounds.applyMatrix4(placementMatrix({ ...item.transform, scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0], matchOffset: 0 }, lineBounds(item.built)))
}

export function titleFraming(items, fixedDistance = false) {
  const box = new THREE.Box3()
  const anchor = new THREE.Box3()
  const solid = items.filter(item => item.built?.body.triangles && item.transform)
  const anchored = solid.some(item => item.type === "top")
  let corners = []
  for (const item of solid) {
    const placed = placedPoints(item, item.transform)
    for (const corner of placed) box.expandByPoint(corner)
    corners = corners.concat(placed)
    if (!anchored || item.type === "top") anchor.union(restBounds(item))
  }
  if (box.isEmpty() || anchor.isEmpty()) return null
  return { anchor, corners, size: box.getSize(new THREE.Vector3()).length(), reach: fixedDistance ? TITLE_REACH : null }
}

export function cornersOf(box) {
  const corners = []
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z))
    }
  }
  return corners
}

function cameraDirection({ pitch, yaw }) {
  const up = radians(pitch)
  const around = radians(yaw)
  return new THREE.Vector3(Math.sin(around) * Math.cos(up), -Math.sin(up), Math.cos(around) * Math.cos(up))
}

export function cameraPose(camera, { anchor, corners, size, angle = DEFAULT_CAMERA, fov = angle.fov, reach }) {
  const target = anchor.getCenter(new THREE.Vector3())
  const direction = cameraDirection(angle)
  const orthographic = camera.isOrthographicCamera
  const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize()
  let widest = 0
  let front = 0
  for (const corner of cornersOf(anchor)) {
    const offset = corner.clone().sub(target)
    widest = Math.max(widest, Math.abs(offset.dot(right)))
    front = Math.max(front, offset.dot(direction))
  }
  const clearance = reach ? Math.max(...corners.map(corner => corner.clone().sub(target).dot(direction))) + reach : 0
  const distance = orthographic ? size * 2 : Math.max((reach ?? widest) / Math.tan(fov * Math.PI / 360) + front, clearance)
  camera.position.copy(target).addScaledVector(direction, distance)
  camera.lookAt(target)
  if (!orthographic) camera.rotateX(radians(angle.tilt))
  camera.updateMatrixWorld(true)
  return { distance, orthographic, lens: orthographic ? Math.cos(radians(angle.tilt)) : 1, inverse: camera.matrixWorld.clone().invert() }
}

export function cameraPoint({ orthographic, lens }, local) {
  const depth = -local.z
  return { x: orthographic ? local.x / lens : local.x / depth, y: orthographic ? local.y / lens ** 2 : local.y / depth, depth }
}

export function frameCamera(camera, { anchor, corners, size, angle = DEFAULT_CAMERA, fov = angle.fov, width, height, frame, maxScale = Infinity, reach }) {
  const aspect = width / height
  const pose = cameraPose(camera, { anchor, corners, size, angle, fov, reach })
  const { distance, orthographic, lens, inverse } = pose
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let near = Infinity
  for (const corner of corners) {
    const { x, y, depth } = cameraPoint(pose, corner.clone().applyMatrix4(inverse))
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    near = Math.min(near, depth)
  }
  const title = { left: 0, top: 0, width: maxX - minX, height: maxY - minY }
  const output = frame?.rect(title)
  const box = output ? frame.bounds(title) : title
  const fitted = Math.max(box.height / 2 / 0.94, box.width / 2 / aspect / 0.94, height / (2 * maxScale * (orthographic ? 1 : distance)))
  const span = output ? Math.max(fitted, height * devicePixelRatio / (2 * frame.pixels(title, output))) : fitted
  const centreX = minX + box.left + box.width / 2
  const centreY = maxY - box.top - box.height / 2
  if (orthographic) {
    Object.assign(camera, { left: (centreX - span * aspect) * lens, right: (centreX + span * aspect) * lens, top: (centreY + span) * lens ** 2, bottom: (centreY - span) * lens ** 2, near: distance / 100, far: distance * 100 })
  } else {
    camera.aspect = aspect
    camera.fov = Math.atan(span) * 360 / Math.PI
    camera.near = Math.max(near - size, near / 100, 0.01)
    camera.far = distance + size * 100
    camera.setViewOffset(width, height, centreX / (span * aspect) * width / 2, -centreY / span * height / 2, width, height)
  }
  camera.updateProjectionMatrix()
}
