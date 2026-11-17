import * as THREE from "three"
import { words } from "../lib/state/scene.js"
import { objectMatrix } from "./placement.js"
import { cameraPoint, cameraPose, titleFraming } from "./titleFraming.js"

export function cameraCover(object) {
  return object.textureSource === "custom" && !!object.customTexture && object.customTextureMode === "cover" && object.customCoverAlign === "camera"
}

export function coverMembers(object, title) {
  if (!object.customCoverSpan) return [object]
  return title.objects.filter(other => other === object || cameraCover(other) && other.customCoverSpan && other.customTexture === object.customTexture && !other.hidden)
}

function rounded(value) {
  return Math.round(value * 1e6) / 1e6
}

export function coverProjection(object, title, built, transform) {
  const stateOf = other => other === object ? { built, transform } : title.runtime[other.id] ?? {}
  const shown = title.objects.filter(other => !words(other, title).every(word => word.hidden))
  const items = shown.map(other => ({ type: other.type, built: stateOf(other).built ?? null, transform: stateOf(other).transform ?? null, outline: title.runtime[other.id]?.outline ?? null }))
  const shot = titleFraming(items, title.camera.fixedDistance)
  if (!shot || !built || !transform) return null
  const pose = cameraPose(title.camera.fov ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera(), { ...shot, angle: title.camera })
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const point = new THREE.Vector3()
  const members = coverMembers(object, title)
  for (const member of members) {
    const state = stateOf(member)
    if (!state.built?.body.triangles || !state.transform) continue
    const matrix = pose.inverse.clone().multiply(objectMatrix(state.transform, state.built))
    const positions = state.built.body.positions
    for (let at = 0; at < positions.length; at += 3) {
      const { x, y } = cameraPoint(pose, point.set(positions[at], positions[at + 1], positions[at + 2]).applyMatrix4(matrix))
      box.minX = Math.min(box.minX, x)
      box.maxX = Math.max(box.maxX, x)
      box.minY = Math.min(box.minY, y)
      box.maxY = Math.max(box.maxY, y)
    }
  }
  if (!(box.maxX > box.minX && box.maxY > box.minY)) return null
  const matrix = pose.inverse.clone().multiply(objectMatrix(transform, built))
  return { matrix: matrix.elements.map(rounded), orthographic: pose.orthographic, lens: rounded(pose.lens), position: [members[0].customCoverX, members[0].customCoverY], box:Object.fromEntries(Object.entries(box).map(([key, value]) => [key, rounded(value)])) }
}
