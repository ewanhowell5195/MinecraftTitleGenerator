import * as THREE from "three"
import { frameCamera, titleFraming } from "#render/titleFraming.js"
import { FACING } from "../placing.js"

const FACING_TURN = new THREE.Quaternion().setFromRotationMatrix(FACING)
const FORWARD = new THREE.Vector3(0, 0, -1)

export function pointsOf(mesh) {
  return mesh.isMesh && (mesh.userData.extent ?? mesh.geometry.attributes.position) || null
}

const measured = new WeakMap()

function meshPoints(mesh, position) {
  const key = mesh.matrixWorld.elements.join()
  const known = measured.get(mesh)
  if (known?.position === position && known.version === position.version && known.key === key) return known.points
  const matrix = FACING.clone().multiply(mesh.matrixWorld)
  const points = []
  for (let index = 0; index < position.count; index++) points.push(new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix))
  measured.set(mesh, { position, version: position.version, key, points })
  return points
}

function shownPoints() {
  let points = []
  Project.model_3d.traverseVisible(mesh => {
    const position = pointsOf(mesh)
    if (position) points = points.concat(meshPoints(mesh, position))
  })
  return points
}

export function shotOf({ title, items }) {
  Project.model_3d.updateMatrixWorld(true)
  const corners = shownPoints()
  if (!corners.length) return null
  const box = new THREE.Box3().setFromPoints(corners)
  const { anchor = box, reach = null } = titleFraming(items.value, title.camera.fixedDistance) ?? {}
  return { anchor, corners, centre: box.getCenter(new THREE.Vector3()).applyMatrix4(FACING), size: box.getSize(new THREE.Vector3()).length(), reach }
}

export function headingOf({ camera, controls }) {
  return new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
}

// Blockbench sizes its gizmos by the zoom, with the bounds Preview.resize gives the viewport
function boundsOf({ left, right, top, bottom }, { width }) {
  const zoom = width / 40 / (right - left)
  const [centreX, centreY] = [(left + right) / 2, (top + bottom) / 2]
  const [halfX, halfY] = [(right - left) / 2 * zoom, (top - bottom) / 2 * zoom]
  return { left: centreX - halfX, right: centreX + halfX, top: centreY + halfY, bottom: centreY - halfY, zoom }
}

export function lensKey({ width, height, camera }) {
  return [width, height].concat(camera.isOrthographicCamera ? [camera.left, camera.right, camera.top, camera.bottom] : camera.fov).join()
}

export function aim(shown, shot, angle, frame = null) {
  const framed = angle.fov ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera()
  frameCamera(framed, { ...shot, angle, width: shown.width, height: shown.height, frame })
  if (shown.isOrtho === !!angle.fov || shown.angle !== null) shown.setProjectionMode(!angle.fov)
  const { camera, controls } = shown
  camera.position.copy(framed.position).applyMatrix4(FACING)
  camera.quaternion.copy(FACING_TURN).multiply(framed.quaternion)
  const distance = framed.position.distanceTo(shot.anchor.getCenter(new THREE.Vector3()))
  controls.target.copy(FORWARD).applyQuaternion(camera.quaternion).multiplyScalar(Math.min(distance, controls.maxDistance * 0.9)).add(camera.position)
  if (angle.fov) Object.assign(camera, { fov: framed.fov, aspect: framed.aspect, near: framed.near, far: framed.far, view: { ...framed.view } })
  else Object.assign(camera, boundsOf(framed, shown), { near: framed.near, far: framed.far })
  camera.updateProjectionMatrix()
  controls.update()
  camera.updateMatrixWorld(true)
}
