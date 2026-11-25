import * as THREE from "three"
import { round } from "#lib/core/maths.js"
import { FORMAT } from "../format.js"
import { FACING } from "../placing.js"
import { titleState } from "../titles.js"
import { inRenderMode } from "./mode.js"
import { aim, headingOf, shotOf } from "./shot.js"

const MOVED = 1e-3
const FILLED = 0.94

const RENDER_ANGLE = { name: "Render Angle", id: "minecraft_title_render", default: true, condition: () => Format?.id === FORMAT && !inRenderMode() }

const unplaced = new Map()
const native = {}
let angled = null
let aiming = false

function slope(fov) {
  return Math.tan(THREE.MathUtils.degToRad(fov) / 2)
}

function sizeKey({ width, height }) {
  return [width, height].join()
}

function poseOf({ camera, controls }) {
  return camera.position.toArray().concat(controls.target.toArray(), camera.zoom)
}

function lensOf({ camPers, camOrtho }) {
  return [camPers, camOrtho].map(({ near, far }) => ({ near, far }))
}

function useLens({ camPers, camOrtho }, lenses) {
  camPers.view = null
  camPers.fov = settings.fov.value
  for (const [index, camera] of [camPers, camOrtho].entries()) Object.assign(camera, lenses[index])
}

export function applyAngle(shown, opened = null) {
  const state = titleState()
  const shot = shown.width && shotOf(state)
  if (!shot) return
  const { orthographic, lenses } = angled?.shown === shown ? angled : { orthographic: shown.isOrtho && shown.angle === null, lenses: lensOf(shown) }
  aiming = true
  aim(shown, shot, state.title.camera)
  aiming = false
  const { camera, controls } = shown
  const away = camera.position.clone().sub(shown.isOrtho ? controls.target : shot.centre)
  angled = { shown, opened, changes: state.changes, project: Project.uuid, orthographic, lenses, away, shot, heading: headingOf(shown), pose: poseOf(shown), size: sizeKey(shown) }
}

function roomFor({ corners, centre }, direction, aspect) {
  const towards = direction.clone().normalize()
  const right = new THREE.Vector3(0, 1, 0).cross(towards).normalize()
  const up = towards.clone().cross(right)
  return corners.map(corner => {
    const offset = corner.clone().applyMatrix4(FACING).sub(centre)
    return { near: offset.dot(towards), half: Math.max(Math.abs(offset.dot(up)), Math.abs(offset.dot(right)) / aspect) / FILLED }
  })
}

function released({ shown, away, shot, heading }, orthographic) {
  const direction = new THREE.Spherical().setFromVector3(away)
  const now = headingOf(shown)
  direction.theta += now.theta - heading.theta
  direction.phi += now.phi - heading.phi
  const room = roomFor(shot, new THREE.Vector3().setFromSpherical(direction.makeSafe()), shown.width / shown.height)
  const distance = orthographic ? away.length() : room.reduce((most, { near, half }) => Math.max(most, near + half / slope(settings.fov.value)), 0)
  direction.radius = Math.min(distance, shown.controls.maxDistance * 0.9)
  const half = room.reduce((most, corner) => Math.max(most, corner.half), 0)
  // Preview.resize shows a fortieth of the viewport's height
  return { position: shot.centre.clone().add(new THREE.Vector3().setFromSpherical(direction)), target: shot.centre, zoom: shown.height / 80 / half }
}

function letGo() {
  const { shown, orthographic, lenses } = angled
  const { position, target, zoom } = released(angled, orthographic)
  angled = null
  useLens(shown, lenses)
  if (shown.isOrtho === orthographic) shown.resize()
  else shown.setProjectionMode(orthographic)
  const { camera, controls } = shown
  camera.position.copy(position)
  controls.target.copy(target)
  if (orthographic) camera.zoom = zoom
  camera.updateProjectionMatrix()
  controls.update()
}

function forget() {
  const { shown, lenses } = angled
  angled = null
  useLens(shown, lenses)
  shown.camPers.updateProjectionMatrix()
}

export function releaseAngle() {
  if (!angled) return false
  letGo()
  return true
}

export function angleMoved({ preview: shown }) {
  if (shown !== angled?.shown || aiming) return
  if (poseOf(shown).some((value, index) => Math.abs(value - angled.pose[index]) > MOVED * Math.max(1, Math.abs(value)))) letGo()
}

export function angleClosed({ project }) {
  unplaced.delete(project.uuid)
  if (angled?.project !== project.uuid) return
  const { shown, orthographic } = angled
  const { position, target, zoom } = released(angled, orthographic)
  if (project.previews[shown.id]) Object.assign(project.previews[shown.id], { position: position.toArray(), target: target.toArray(), orthographic, ...(orthographic && { zoom }) })
  forget()
}

function placeOf({ position }) {
  return position.toArray().map(value => round(value, 2)).join()
}

export function placeLater({ project: { uuid, format } }) {
  if (format.id === FORMAT) unplaced.set(uuid, placeOf(Preview.selected.camera))
}

function placeNew(shown) {
  if (!shown.width || !shotOf(titleState())) return
  const untouched = unplaced.get(Project.uuid) === placeOf(shown.camera)
  unplaced.delete(Project.uuid)
  if (untouched) applyAngle(shown, Undo.history.length)
}

export function angleDrawn(camera) {
  if (inRenderMode() || camera !== Preview.selected?.camera) return
  if (unplaced.has(Project?.uuid)) placeNew(Preview.selected)
  if (!angled || angled.shown !== Preview.selected) return
  const { shown, opened, changes, size } = angled
  const loaded = opened === Undo.history.length && changes !== titleState().changes
  if (loaded || size !== sizeKey(shown)) applyAngle(shown, opened)
}

export function registerAngle() {
  DefaultCameraPresets.push(RENDER_ANGLE)
  Object.assign(native, { loadAnglePreset: Preview.prototype.loadAnglePreset, setProjectionMode: Preview.prototype.setProjectionMode })
  Preview.prototype.loadAnglePreset = function(preset) {
    if (preset === RENDER_ANGLE) {
      applyAngle(this)
      return this
    }
    if (angled?.shown === this) forget()
    return native.loadAnglePreset.call(this, preset)
  }
  Preview.prototype.setProjectionMode = function(orthographic, ...rest) {
    if (angled?.shown === this && !aiming) {
      letGo()
      if (this.isOrtho === !!orthographic) return this
    }
    return native.setProjectionMode.call(this, orthographic, ...rest)
  }
}

export function unregisterAngle() {
  releaseAngle()
  Object.assign(Preview.prototype, native)
  DefaultCameraPresets.remove(RENDER_ANGLE)
}
