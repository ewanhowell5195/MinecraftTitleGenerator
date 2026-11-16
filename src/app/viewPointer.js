import * as THREE from "three"
import { ref } from "vue"
import { scene as title, select } from "../lib/state/scene.js"
import { FORM_SECTIONS, view } from "../lib/state/view.js"
import { pickEntry } from "../render/stage.js"
import { orbitTurned } from "../render/orbit.js"

const WHEEL_ZOOM = 0.002
const PINCH_WHEEL_ZOOM = 0.01
const LINE_HEIGHT = 16
const CLICK_DISTANCE = 6

export function useViewPointer(rig, { orbit, orbiting, navigable, isFramed, zoomBy, panBy }, entries) {
  const pointers = new Map()
  const panning = ref(false)
  let pressed = null

  function clipPoint(event) {
    const box = rig.renderer.domElement.getBoundingClientRect()
    return { x: (event.clientX - box.left) / box.width * 2 - 1, y: 1 - (event.clientY - box.top) / box.height * 2 }
  }

  function zoom(event) {
    if (!navigable.value || !isFramed()) return
    event.preventDefault()
    const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? LINE_HEIGHT : 1
    zoomBy(Math.exp(-event.deltaY * lines * (event.ctrlKey ? PINCH_WHEEL_ZOOM : WHEEL_ZOOM)))
  }

  function grabView(event) {
    if (!navigable.value || !isFramed() || rig.controls.dragging || event.button === 0 && rig.controls.axis) return
    pointers.set(event.pointerId, { ...clipPoint(event), button: event.button, press: [event.clientX, event.clientY], dragged: false })
    rig.renderer.domElement.setPointerCapture(event.pointerId)
  }

  function moveView(event) {
    const last = pointers.get(event.pointerId)
    if (!last) return
    const point = { ...clipPoint(event), button: last.button, press: last.press, dragged: true }
    const other = Array.from(pointers).find(([id]) => id !== event.pointerId)?.[1]
    if (!last.dragged && !other && Math.hypot(event.clientX - last.press[0], event.clientY - last.press[1]) <= CLICK_DISTANCE) return
    pointers.set(event.pointerId, point)
    panning.value = true
    if (!last.dragged) return
    if (!other) {
      if (orbiting.value && last.button === 0) orbit.value = orbitTurned(orbit.value, (point.x - last.x) * Math.PI * rig.frameSize.width / rig.frameSize.height, (last.y - point.y) * Math.PI)
      else panBy(point.x - last.x, point.y - last.y)
      return
    }
    zoomBy(Math.hypot(point.x - other.x, point.y - other.y) / Math.hypot(last.x - other.x, last.y - other.y))
    panBy((point.x - last.x) / 2, (point.y - last.y) / 2)
  }

  function dropView(event) {
    if (pointers.get(event.pointerId)?.button === 2) holdMenu()
    pointers.delete(event.pointerId)
    panning.value = pointers.size > 0
  }

  function holdMenu() {
    function block(event) {
      event.preventDefault()
      release()
    }
    function release() {
      window.removeEventListener("contextmenu", block, true)
      window.removeEventListener("pointerdown", release, true)
    }
    window.addEventListener("contextmenu", block, true)
    window.addEventListener("pointerdown", release, true)
  }

  function pressText(event) {
    pressed = { x: event.clientX, y: event.clientY }
  }

  function pickText(event) {
    if (FORM_SECTIONS.has(view.section) || view.render || rig.controls.axis || !pressed || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > CLICK_DISTANCE) return
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(clipPoint(event), rig.camera)
    const id = pickEntry(entries, raycaster)
    const object = title.objects.find(item => item.id === id)
    if (object) select(object)
  }

  function noMenu(event) {
    if (navigable.value) event.preventDefault()
  }

  function listen(element) {
    element.addEventListener("wheel", zoom, { passive: false })
    element.addEventListener("pointerdown", grabView)
    element.addEventListener("pointermove", moveView)
    element.addEventListener("pointerup", dropView)
    element.addEventListener("pointercancel", dropView)
    element.addEventListener("pointerdown", pressText)
    element.addEventListener("click", pickText)
    element.addEventListener("contextmenu", noMenu)
  }

  return { panning, listen }
}
