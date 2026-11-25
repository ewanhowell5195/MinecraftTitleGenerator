import * as THREE from "three"
import { effectScope, reactive, watch } from "vue"
import { clamp, round } from "#lib/core/maths.js"
import { cameraChanges } from "#lib/settings/camera.js"
import { frameBounds, framePixels, frameRect, framing } from "#render/framing.js"
import { screenBounds } from "#render/render.js"
import { frameCamera, titleFraming } from "#render/titleFraming.js"
import { keepCamera } from "../file.js"
import { FACING } from "../placing.js"
import { titleState } from "../titles.js"
import { CAMERA, beginEdit, finishEdit } from "../undo.js"
import { createFrame } from "./frame.js"

const FACING_TURN = new THREE.Quaternion().setFromRotationMatrix(FACING)
const FORWARD = new THREE.Vector3(0, 0, -1)
const TURN_PAUSE = 300
const { radToDeg: degrees } = THREE.MathUtils

export const renderView = reactive({ resolution: 2048, customResolution: null, antialias: true })

const before = new Map()
let preview = null
let state = null
let scope = null
let frame = null
let shot = null
let heading = null
let fitting = false
let fitted = null
let pressed = false
let turning = null
let measured = null

export function viewCamera() {
  return preview.camera
}

export function viewSize() {
  return new THREE.Vector2(preview.width, preview.height)
}

export function pointsOf(mesh) {
  return mesh.isMesh && (mesh.userData.extent ?? mesh.geometry.attributes.position) || null
}

function shownPoints() {
  const points = []
  Project.model_3d.traverseVisible(mesh => {
    const position = pointsOf(mesh)
    if (!position) return
    const matrix = FACING.clone().multiply(mesh.matrixWorld)
    for (let index = 0; index < position.count; index++) points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix))
  })
  return points
}

function shotOf() {
  const { fixedDistance } = state.title.camera
  const key = [state.changes, fixedDistance].join()
  if (shot?.key === key) return shot
  Project.model_3d.updateMatrixWorld(true)
  const corners = shownPoints()
  if (!corners.length) return null
  const box = new THREE.Box3().setFromPoints(corners)
  const { anchor = box, reach = null } = titleFraming(state.items.value, fixedDistance) ?? {}
  return { key, anchor, corners, size: box.getSize(new THREE.Vector3()).length(), reach }
}

function headingOf() {
  return new THREE.Spherical().setFromVector3(preview.camera.position.clone().sub(preview.controls.target))
}

export function fitView() {
  if (!preview?.width) return
  shot = shotOf()
  if (!shot) return
  fitting = true
  const angle = state.title.camera
  const framed = angle.fov ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera()
  frameCamera(framed, { ...shot, angle, width: preview.width, height: preview.height, frame: { rect: frameRect, bounds: frameBounds, pixels: framePixels } })
  if (preview.isOrtho === !!angle.fov || preview.angle !== null) preview.setProjectionMode(!angle.fov)
  const { camera, controls } = preview
  camera.position.copy(framed.position).applyMatrix4(FACING)
  camera.quaternion.copy(FACING_TURN).multiply(framed.quaternion)
  const distance = Math.min(framed.position.distanceTo(shot.anchor.getCenter(new THREE.Vector3())), controls.maxDistance * 0.9)
  controls.target.copy(FORWARD).applyQuaternion(camera.quaternion).multiplyScalar(distance).add(camera.position)
  if (angle.fov) Object.assign(camera, { fov: framed.fov, aspect: framed.aspect, near: framed.near, far: framed.far, view: { ...framed.view } })
  else Object.assign(camera, { left: framed.left, right: framed.right, top: framed.top, bottom: framed.bottom, near: framed.near, far: framed.far, zoom: 1 })
  camera.updateProjectionMatrix()
  controls.update()
  camera.updateMatrixWorld(true)
  heading = headingOf()
  fitted = sizeKey()
  fitting = false
}

function endTurn() {
  if (!turning) return
  clearTimeout(turning)
  turning = null
  finishEdit("Rotate camera")
}

function waitForTurn() {
  clearTimeout(turning)
  turning = setTimeout(() => pressed ? waitForTurn() : endTurn(), TURN_PAUSE)
}

function press() {
  pressed = true
}

function release() {
  pressed = false
}

export function viewTurned({ preview: turned }) {
  if (!preview || turned !== preview || fitting || !heading) return
  const { theta, phi } = headingOf()
  const { camera } = state.title
  beginEdit(CAMERA, "camera-turn")
  waitForTurn()
  const around = (degrees(theta - heading.theta) + 540) % 360 - 180
  camera.yaw = round(clamp(camera.yaw + around, -89, 89), 2)
  camera.pitch = round(clamp(camera.pitch + degrees(phi - heading.phi), -89, 89), 2)
  fitView()
}

export function viewChanged() {
  shot = measured = null
  fitView()
}

function sizeKey() {
  return [preview.width, preview.height].join()
}

export function titleRect() {
  const { camera, width, height } = preview
  const key = [state.changes, width, height].concat(camera.projectionMatrix.elements, camera.matrixWorld.elements).join()
  if (measured?.key !== key) {
    const bounds = screenBounds(Project.model_3d, camera)
    measured = { key, rect: bounds && { left: bounds.minX * width, top: bounds.minY * height, width: (bounds.maxX - bounds.minX) * width, height: (bounds.maxY - bounds.minY) * height } }
  }
  return measured.rect
}

export function viewDrawn(camera) {
  if (camera !== preview?.camera) return
  if (fitted !== sizeKey()) fitView()
  frame.draw(titleRect())
}

function cameraState() {
  const { camPers, camOrtho, controls, isOrtho, angle } = preview
  return { isOrtho, angle, enablePan: controls.enablePan, enableZoom: controls.enableZoom, target: controls.target.clone(), pers: { position: camPers.position.clone(), fov: camPers.fov, near: camPers.near, far: camPers.far }, ortho: { position: camOrtho.position.clone(), zoom: camOrtho.zoom, near: camOrtho.near, far: camOrtho.far } }
}

function restore({ isOrtho, angle, enablePan, enableZoom, target, pers, ortho }) {
  const { camPers, camOrtho, controls } = preview
  Object.assign(controls, { enablePan, enableZoom })
  camPers.view = null
  preview.setProjectionMode(isOrtho)
  if (angle !== null) preview.setLockedAngle(angle)
  for (const [camera, { position, ...values }] of [[camPers, pers], [camOrtho, ortho]]) {
    Object.assign(camera, values)
    camera.position.copy(position)
    camera.updateProjectionMatrix()
  }
  controls.target.copy(target)
  controls.update()
}

export function enterView() {
  preview = Preview.selected ?? main_preview
  state = titleState()
  if (!before.has(Project.uuid)) before.set(Project.uuid, cameraState())
  state.title.view.render = true
  Object.assign(preview.controls, { enablePan: false, enableZoom: false })
  preview.orbit_gizmo?.hide()
  // Blockbench only turns the camera with the left button when nothing is under the pointer
  preview.raycast = () => false
  addEventListener("pointerdown", press, true)
  addEventListener("pointerup", release, true)
  shot = heading = fitted = measured = null
  frame = createFrame(preview)
  scope = effectScope(true)
  scope.run(() => {
    watch(() => cameraChanges(state.title.camera), changes => {
      keepCamera(changes)
      fitView()
    })
    watch(state.items, fitView, { flush: "post" })
    watch([() => JSON.stringify(framing), () => renderView.resolution], fitView)
  })
  fitView()
}

export function leaveView() {
  endTurn()
  removeEventListener("pointerdown", press, true)
  removeEventListener("pointerup", release, true)
  delete preview.raycast
  preview.orbit_gizmo?.unhide()
  scope.stop()
  frame.remove()
  state.title.view.render = false
  heading = null
  restore(before.get(state.project.uuid))
  if (Project === state.project) before.delete(state.project.uuid)
  preview = null
}
