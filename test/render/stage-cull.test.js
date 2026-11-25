import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { quietStorage } from "../helpers/browser.js"

quietStorage()
globalThis.devicePixelRatio = 1

const { createStage, cullOutlines } = await import("#render/stage.js")

const outline = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]),
  uvs: new Float32Array(12),
  triangles: 2,
  facing: [{ normal: [0, 0, 1], point: [0, 0, 0], start: 0, count: 3 }, { normal: [0, 0, -1], point: [0, 0, 0], start: 3, count: 3 }]
}

function cameraAt(z) {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 0, z)
  camera.updateMatrixWorld()
  return camera
}

describe("unseen face culling", () => {
  test("swapping the visible faces frees the old buffers before replacing them", () => {
    const stage = createStage()
    stage.sync([{ id: 1, paintLine: "word-1", built: null, outline, halo: null, holes: null, transform: null, hidden: false }])
    const { geometry } = stage.entries.get(1).outline
    stage.scene.updateMatrixWorld(true)
    const freed = []
    geometry.addEventListener("dispose", () => freed.push(geometry.attributes.position.array.slice()))
    cullOutlines(stage.scene, cameraAt(10))
    const front = geometry.attributes.position.array.slice()
    cullOutlines(stage.scene, cameraAt(10))
    cullOutlines(stage.scene, cameraAt(-10))
    assert.deepEqual(Array.from(front), Array.from(outline.positions.subarray(0, 9)))
    assert.deepEqual(Array.from(geometry.attributes.position.array), Array.from(outline.positions.subarray(9)))
    assert.deepEqual(freed.map(array => Array.from(array)), [Array.from(outline.positions), Array.from(front)])
    stage.dispose()
  })
})
