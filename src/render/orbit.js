import * as THREE from "three"
import { clamp, radians } from "../lib/core/maths.js"

const PITCH_LIMIT = radians(89)
const ORBIT_FILL = 0.94
const DOLLY_LIMITS = [0.05, 20]

export const ORBIT_FOV = 40

function orbitPose(camera, { target, yaw, pitch }, distance) {
  const centre = new THREE.Vector3().fromArray(target)
  const offset = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
  camera.position.copy(centre).addScaledVector(offset, distance)
  camera.up.set(0, 1, 0)
  camera.lookAt(centre)
  camera.updateMatrixWorld(true)
}

export function orbitStart(position, pivot, corners, fov, aspect) {
  const offset = position.clone().sub(pivot).normalize()
  const orbit = { target: pivot.toArray(), yaw: Math.atan2(offset.x, offset.z), pitch: clamp(Math.asin(offset.y), -PITCH_LIMIT, PITCH_LIMIT) }
  const probe = new THREE.PerspectiveCamera()
  orbitPose(probe, orbit, 1)
  const inverse = probe.matrixWorld.clone().invert()
  const tanY = Math.tan(fov * Math.PI / 360) * ORBIT_FILL
  const tanX = tanY * aspect
  let distance = 0
  for (const corner of corners) {
    const local = corner.clone().applyMatrix4(inverse)
    const behind = -local.z - 1
    distance = Math.max(distance, Math.abs(local.x) / tanX - behind, Math.abs(local.y) / tanY - behind)
  }
  return { ...orbit, distance: Math.max(distance, 1), home: Math.max(distance, 1) }
}

export function placeOrbit(camera, orbit, { fov, aspect, size }) {
  if (camera.isOrthographicCamera) {
    const span = orbit.distance * Math.tan(ORBIT_FOV * Math.PI / 360)
    const reach = Math.max(orbit.distance, size * 2)
    orbitPose(camera, orbit, reach)
    Object.assign(camera, { left: -span * aspect, right: span * aspect, top: span, bottom: -span, near: reach / 100, far: reach * 100 })
  } else {
    orbitPose(camera, orbit, orbit.distance)
    camera.clearViewOffset()
    Object.assign(camera, { fov, aspect, near: orbit.distance / 100, far: orbit.distance + size * 100 })
  }
  camera.updateProjectionMatrix()
}

export function orbitTurned(orbit, right, down) {
  return { ...orbit, yaw: orbit.yaw - right, pitch: clamp(orbit.pitch + down, -PITCH_LIMIT, PITCH_LIMIT) }
}

export function orbitDollied(orbit, factor) {
  return { ...orbit, distance: clamp(orbit.distance / factor, orbit.home * DOLLY_LIMITS[0], orbit.home * DOLLY_LIMITS[1]) }
}

export function orbitPanned(orbit, camera, dx, dy, { fov, aspect }) {
  const span = orbit.distance * Math.tan((camera.isOrthographicCamera ? ORBIT_FOV : fov) * Math.PI / 360)
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const target = new THREE.Vector3().fromArray(orbit.target).addScaledVector(right, -dx * span * aspect).addScaledVector(up, -dy * span)
  return { ...orbit, target: target.toArray() }
}
