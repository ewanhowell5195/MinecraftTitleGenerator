import * as THREE from "three"
import { clamp } from "../lib/core/maths.js"

const ZOOM_LIMITS = [0.25, 32]
const KEPT_ON_SCREEN = 0.1

export const UNZOOMED = { scale: 1, x: 0, y: 0 }

export function screenExtent(points, matrix) {
  const extent = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity }
  const point = new THREE.Vector4()
  for (const { x, y, z } of points) {
    point.set(x, y, z, 1).applyMatrix4(matrix)
    if (point.w <= 0) continue
    extent.left = Math.min(extent.left, point.x / point.w)
    extent.right = Math.max(extent.right, point.x / point.w)
    extent.bottom = Math.min(extent.bottom, point.y / point.w)
    extent.top = Math.max(extent.top, point.y / point.w)
  }
  return extent.left <= extent.right ? extent : null
}

function slid(at, scale, low, high) {
  const kept = KEPT_ON_SCREEN * scale * (high - low)
  return clamp(at, -1 + kept - scale * high, 1 - kept - scale * low)
}

export function keptPan({ scale, x, y }, { extent }) {
  return { scale, x: slid(x, scale, extent.left, extent.right), y: slid(y, scale, extent.bottom, extent.top) }
}

export function pannedBy(pan, dx, dy, view) {
  return keptPan({ scale: pan.scale, x: pan.x + dx, y: pan.y + dy }, view)
}

export function zoomedAt(pan, factor, x, y, view) {
  const scale = clamp(pan.scale * factor, ...ZOOM_LIMITS)
  const change = scale / pan.scale
  return keptPan({ scale, x: x - (x - pan.x) * change, y: y - (y - pan.y) * change }, view)
}

export function panMatrix({ scale, x, y }) {
  return new THREE.Matrix4().set(scale, 0, 0, x, 0, scale, 0, y, 0, 0, 1, 0, 0, 0, 0, 1)
}
