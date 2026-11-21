import assert from "node:assert/strict"
import { describe, test } from "node:test"
import * as THREE from "three"
import { builtOf, transform } from "../helpers/stage.js"

globalThis.devicePixelRatio = 1
globalThis.WheelEvent ??= { DOM_DELTA_PIXEL: 0, DOM_DELTA_LINE: 1 }

const { useViewCamera } = await import("../../src/app/viewCamera.js")
const { useViewPointer } = await import("../../src/app/viewPointer.js")
const { UNZOOMED, keptPan, panMatrix } =await import("../../src/render/pan.js")

const WIDTH = 800
const HEIGHT = 400

function setup(items = []) {
  const element = Object.assign(new EventTarget(), { setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: WIDTH, height: HEIGHT }) })
  const rig = { renderer: { domElement: element }, camera: new THREE.PerspectiveCamera(), controls: { dragging: false, axis: null }, frameSize: { width: WIDTH, height: HEIGHT } }
  const camera = useViewCamera(rig, { props: { items }, entries: new Map(), invalidate() {} })
  const { listen } = useViewPointer(rig, { ...camera, isFramed: () => true }, new Map())
  listen(element)
  function fire(type, fields) {
    element.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields))
  }
  return { camera, pan: camera.pan, fire }
}

function lopsided() {
  return [{ type: "top", settled: true, transform: transform(), built: builtOf([-1.3, -0.5, 0], [0.9, 0.3, 0]) }]
}

function clip(clientX, clientY) {
  return new THREE.Vector3(clientX / WIDTH * 2 - 1, 1 - clientY / HEIGHT * 2, 0)
}

function titlePoint(pan, clientX, clientY) {
  return clip(clientX, clientY).applyMatrix4(panMatrix(pan).invert())
}

function onScreen(pan, point) {
  return point.clone().applyMatrix4(panMatrix(pan))
}

function near(actual, expected) {
  assert.ok(actual.distanceTo(expected) < 1e-9, `${actual.toArray()} is not ${expected.toArray()}`)
}

describe("viewport zoom", () => {
  test("the wheel keeps the point under the cursor where it is", () => {
    const { pan, fire } = setup()
    for (const [x, y] of [[600, 100], [150, 320], [400, 200]]) {
      const before = pan.value
      const point = titlePoint(before, x, y)
      fire("wheel", { deltaY: -120, deltaMode: 0, clientX: x, clientY: y })
      assert.ok(pan.value.scale > before.scale)
      near(onScreen(pan.value, point), clip(x, y))
    }
  })

  test("the pan limit still holds a wheel zoom at the edge", () => {
    const { pan, fire } = setup()
    fire("wheel", { deltaY: -1200, deltaMode: 0, clientX: 790, clientY: 10 })
    assert.ok(pan.value.scale > 8)
    assert.deepEqual(keptPan(pan.value, { extent: { left: 0, right: 0, bottom: 0, top: 0 } }), pan.value)
    assert.ok(onScreen(pan.value, titlePoint({ scale: 1, x: 0, y: 0 }, 790, 10)).distanceTo(clip(790, 10)) > 0.1)
  })

  test("a pinch keeps the point between the fingers between them", () => {
    const { pan, fire } = setup()
    fire("pointerdown", { pointerId: 1, button: 0, clientX: 300, clientY: 150 })
    fire("pointerdown", { pointerId: 2, button: 0, clientX: 500, clientY: 250 })
    fire("pointermove", { pointerId: 1, clientX: 290, clientY: 145 })
    fire("pointermove", { pointerId: 2, clientX: 505, clientY: 250 })
    const fingers = [[290, 145], [505, 250]]
    for (const [id, x, y] of [[1, 260, 130], [2, 560, 270], [1, 240, 160], [2, 520, 300]]) {
      const middle = [(fingers[0][0] + fingers[1][0]) / 2, (fingers[0][1] + fingers[1][1]) / 2]
      const point = titlePoint(pan.value, ...middle)
      fingers[id - 1] = [x, y]
      fire("pointermove", { pointerId: id, clientX: x, clientY: y })
      near(onScreen(pan.value, point), clip((fingers[0][0] + fingers[1][0]) / 2, (fingers[0][1] + fingers[1][1]) / 2))
    }
    assert.ok(pan.value.scale > 1)
  })
})

describe("viewport pan limit", () => {
  test("a title hanging off one side leaves an untouched view where it is", () => {
    const { camera } = setup(lopsided())
    camera.holdPan()
    assert.equal(camera.pan.value, UNZOOMED)
    assert.equal(camera.moved.value, false)
  })

  test("a moved view is still pulled back inside the limits", () => {
    const { camera, fire } = setup(lopsided())
    fire("wheel", { deltaY: -100, deltaMode: 0, clientX: 400, clientY: 200 })
    camera.pan.value = { ...camera.pan.value, x: -5 }
    camera.holdPan()
    const view = { extent: { left: -1.3, right: 0.9, bottom: -0.5, top: 0.3 } }
    assert.ok(camera.pan.value.x > -5)
    assert.deepEqual(camera.pan.value, keptPan(camera.pan.value, view))
  })
})
