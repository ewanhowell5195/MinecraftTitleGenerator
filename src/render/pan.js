import * as THREE from "three"
import { clamp } from "../lib/core/maths.js"

const ZOOM_LIMITS = [0.25, 32]
const PAN_MARGIN = 0.1

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

function slid(at, scale, low, high, margin) {
  const ends = [-1 - scale * low, 1 - scale * high]
  const give = margin * Math.min(1, scale * (high - low) / 2)
  return clamp(at, Math.min(...ends) - give, Math.max(...ends) + give)
}

export function keptPan({ scale, x, y }, { extent, aspect }) {
  return { scale, x: slid(x, scale, extent.left, extent.right, PAN_MARGIN * Math.min(1, 1 / aspect)), y: slid(y, scale, extent.bottom, extent.top, PAN_MARGIN * Math.min(1, aspect)) }
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
