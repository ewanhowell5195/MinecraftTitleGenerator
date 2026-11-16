import * as THREE from "three"
import { computed, ref, shallowRef } from "vue"
import { frameBounds, framePixels, frameRect } from "../render/framing.js"
import { scene as title } from "../lib/state/scene.js"
import { view, viewportChanges } from "../lib/state/view.js"
import { frameCamera, titleFraming } from "../render/titleFraming.js"
import { UNZOOMED, keptPan, panMatrix, pannedBy, screenExtent, zoomedAt } from "../render/pan.js"
import { ORBIT_FOV, orbitDollied, orbitPanned, orbitStart, placeOrbit } from "../render/orbit.js"

const MAX_SCALE = 5
const NO_EXTENT = { left: 0, right: 0, bottom: 0, top: 0 }

export function useViewCamera(rig, { props, entries, invalidate }) {
  const pan = shallowRef(UNZOOMED)
  const orbit = shallowRef(null)
  const orbiting = ref(false)
  const navigable = computed(() => !view.render && !view.camera)
  const moved = computed(() => orbiting.value ? orbit.value !== orbitHome : pan.value !== UNZOOMED)
  const baseProjection = new THREE.Matrix4()
  const basePosition = new THREE.Vector3()
  const baseQuaternion = new THREE.Quaternion()
  const baseView = new THREE.Matrix4()
  let fitted = null
  let framedTitle = null
  let orbitHome = null
  let extent = null
  let extentFor = null
  let framed = false

  function refit() {
    if (moved.value && fitted !== null || rig.controls.dragging || fitted === props.items || !entries.size || !props.items.every(item => item.settled)) return
    fitted = props.items
    fitCamera()
  }

  function fitCamera() {
    invalidate()
    viewportChanges.value++
    extentFor = null
    const shot = titleFraming(props.items, title.camera.fixedDistance)
    if (!shot) return
    frameCamera(rig.camera, { ...shot, angle: title.camera, ...rig.frameSize, maxScale: view.render ? Infinity : MAX_SCALE, frame: view.render ? { rect: frameRect, bounds: frameBounds, pixels: framePixels } : null })
    framed = true
    framedTitle = shot
    baseProjection.copy(rig.camera.projectionMatrix)
    basePosition.copy(rig.camera.position)
    baseQuaternion.copy(rig.camera.quaternion)
    baseView.copy(rig.camera.matrixWorldInverse)
    measure(shot)
    applyView()
  }

  function measure(shot) {
    extent = shot && screenExtent(shot.corners, new THREE.Matrix4().multiplyMatrices(baseProjection, baseView))
    extentFor = props.items
  }

  function panView() {
    if (extentFor !== props.items && props.items.every(item => item.settled)) measure(titleFraming(props.items, title.camera.fixedDistance))
    return { extent: extent ?? NO_EXTENT, aspect: rig.frameSize.width / rig.frameSize.height }
  }

  function holdPan() {
    if (orbiting.value || !navigable.value) return
    const held = keptPan(pan.value, panView())
    if (held.x === pan.value.x && held.y === pan.value.y) return
    pan.value = held
    applyView()
  }

  function lens() {
    return { fov: title.camera.fov || ORBIT_FOV, aspect: rig.frameSize.width / rig.frameSize.height, size: framedTitle?.size ?? 1 }
  }

  function applyView() {
    rig.controls.flat = !(orbiting.value && orbit.value)
    if (orbiting.value && orbit.value) {
      placeOrbit(rig.camera, orbit.value, lens())
    } else {
      rig.camera.position.copy(basePosition)
      rig.camera.quaternion.copy(baseQuaternion)
      rig.camera.updateMatrixWorld(true)
      rig.camera.projectionMatrix.multiplyMatrices(panMatrix(pan.value), baseProjection)
      rig.camera.projectionMatrixInverse.copy(rig.camera.projectionMatrix).invert()
    }
    invalidate()
  }

  function zoomBy(factor) {
    if (orbiting.value) orbit.value = orbitDollied(orbit.value, factor)
    else pan.value = zoomedAt(pan.value, factor, 0, 0, panView())
  }

  function panBy(dx, dy) {
    if (orbiting.value) orbit.value = orbitPanned(orbit.value, rig.camera, dx, dy, lens())
    else pan.value = pannedBy(pan.value, dx, dy, panView())
  }

  function resetView() {
    pan.value = UNZOOMED
    if (orbiting.value) orbit.value = orbitHome
  }

  function toggleOrbit() {
    if (!framed) return
    orbiting.value = !orbiting.value
    const { fov, aspect } = lens()
    orbitHome = orbiting.value ? orbitStart(basePosition, new THREE.Box3().setFromPoints(framedTitle.corners).getCenter(new THREE.Vector3()), framedTitle.corners, fov, aspect) : null
    orbit.value = orbitHome
    if (!orbiting.value) fitCamera()
  }

  function homeView() {
    orbiting.value = false
    orbit.value = orbitHome = null
    resetView()
    fitCamera()
  }

  return { pan, orbit, orbiting, navigable, moved, hasFitted: () => fitted !== null, isFramed: () => framed, refit, fitCamera, holdPan, applyView, zoomBy, panBy, resetView, toggleOrbit, homeView }
}
