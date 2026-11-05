import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { aspectOf, fitTitle, fromAspect, minecraftLayout, outputSize, screenBounds } from "../src/lib/render.js"

const SIZES = [256, 512, 1024, 2048]

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

function closeBounds(actual, expected) {
  assert.ok(actual, "expected bounds, got null")
  for (const key of ["minX", "maxX", "minY", "maxY"]) close(actual[key], expected[key])
}

function meshOf(points) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(points.flat()), 3))
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
}

function sceneOf(...objects) {
  const scene = new THREE.Scene()
  for (const object of objects) scene.add(object)
  scene.updateMatrixWorld(true)
  return scene
}

function flatCamera() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 5
  camera.updateMatrixWorld()
  return camera
}

function deepCamera() {
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100)
  camera.position.z = 5
  camera.updateMatrixWorld()
  return camera
}

describe("screenBounds", () => {
  test("measures in screen fractions with y running down", () => {
    const scene = sceneOf(meshOf([[0, 0, 0], [0.5, 0, 0], [0.5, 0.5, 0]]))
    closeBounds(screenBounds(scene, flatCamera()), { minX: 0.5, maxX: 0.75, minY: 0.25, maxY: 0.5 })
  })

  test("covers every mesh in the scene", () => {
    const scene = sceneOf(meshOf([[-1, -1, 0], [-0.5, -1, 0], [-0.5, -0.5, 0]]), meshOf([[0, 0, 0], [0.5, 0, 0], [0.5, 0.5, 0]]))
    closeBounds(screenBounds(scene, flatCamera()), { minX: 0, maxX: 0.75, minY: 0.25, maxY: 1 })
  })

  test("applies the mesh world transform", () => {
    const mesh = meshOf([[-0.5, -0.5, 0], [0, -0.5, 0], [0, 0, 0]])
    mesh.position.set(0.5, 0.5, 0)
    closeBounds(screenBounds(sceneOf(mesh), flatCamera()), { minX: 0.5, maxX: 0.75, minY: 0.25, maxY: 0.5 })
  })

  test("clamps to the edges of the screen", () => {
    const scene = sceneOf(meshOf([[-3, -3, 0], [0.5, -3, 0], [0.5, 3, 0]]))
    closeBounds(screenBounds(scene, flatCamera()), { minX: 0, maxX: 0.75, minY: 0, maxY: 1 })
  })

  test("ignores vertices behind a perspective camera", () => {
    const scene = sceneOf(meshOf([[0, 0, 0], [5, 5, 0], [100, 100, 10]]))
    closeBounds(screenBounds(scene, deepCamera()), { minX: 0.5, maxX: 1, minY: 0, maxY: 0.5 })
  })

  test("ignores hidden meshes and meshes in hidden groups", () => {
    const hidden = meshOf([[-1, -1, 0], [-0.9, -1, 0], [-0.9, -0.9, 0]])
    hidden.visible = false
    const group = new THREE.Group()
    group.visible = false
    group.add(meshOf([[0.9, 0.9, 0], [1, 0.9, 0], [1, 1, 0]]))
    const scene = sceneOf(hidden, group, meshOf([[0, 0, 0], [0.5, 0, 0], [0.5, 0.5, 0]]))
    closeBounds(screenBounds(scene, flatCamera()), { minX: 0.5, maxX: 0.75, minY: 0.25, maxY: 0.5 })
  })

  test("returns null for an empty scene", () => {
    assert.equal(screenBounds(sceneOf(), flatCamera()), null)
  })

  test("returns null when everything is off screen", () => {
    assert.equal(screenBounds(sceneOf(meshOf([[2, 2, 0], [3, 2, 0], [3, 3, 0]])), flatCamera()), null)
  })

  test("returns null for geometry with no screen area", () => {
    assert.equal(screenBounds(sceneOf(meshOf([[0, 0, 0], [0.5, 0, 0], [0.25, 0, 0]])), flatCamera()), null)
  })
})

describe("minecraftLayout", () => {
  test("1.20 is one strip with a quarter height output", () => {
    assert.deepEqual(minecraftLayout("1.20", 1024), { width: 1024, height: 176, left: 0, top: 0, padded: [1024, 256], output: [1024, 256], split: null, shift: null })
  })

  test("any other mode falls back to the 1.20 strip", () => {
    assert.deepEqual(minecraftLayout("unknown", 512), minecraftLayout("1.20", 512))
  })

  test("1.19 at 256 matches the vanilla atlas layout", () => {
    assert.deepEqual(minecraftLayout("1.19", 256), { width: 274, height: 44, left: 0, top: 0, padded: [274, 44], output: [256, 256], split: 155, shift: [-155, 45] })
  })

  test("1.19 scales the atlas with the texture size", () => {
    assert.deepEqual(minecraftLayout("1.19", 1024), { width: 1096, height: 176, left: 0, top: 0, padded: [1096, 176], output: [1024, 1024], split: 620, shift: [-620, 180] })
  })

  test("mojang keeps a margin inside a double width strip", () => {
    assert.deepEqual(minecraftLayout("mojang", 1024), { width: 2032, height: 508, left: 8, top: 2, padded: [2048, 512], output: [1024, 1024], split: 1024, shift: [-1024, 512] })
  })

  test("the title area stays inside the padded image", () => {
    for (const mode of ["1.20", "1.19", "mojang"]) {
      for (const size of SIZES) {
        const layout = minecraftLayout(mode, size)
        assert.ok(layout.left + layout.width <= layout.padded[0], `${mode} ${size} width`)
        assert.ok(layout.top + layout.height <= layout.padded[1], `${mode} ${size} height`)
      }
    }
  })

  test("split strips land inside the output without overlapping", () => {
    for (const mode of ["1.19", "mojang"]) {
      for (const size of SIZES) {
        const { padded, output, split, shift } = minecraftLayout(mode, size)
        assert.ok(split <= output[0], `${mode} ${size} first strip width`)
        assert.ok(padded[1] <= output[1], `${mode} ${size} first strip height`)
        assert.ok(split + shift[0] >= 0, `${mode} ${size} second strip left`)
        assert.ok(split + shift[0] + padded[0] - split <= output[0], `${mode} ${size} second strip right`)
        assert.ok(shift[1] >= padded[1], `${mode} ${size} strips overlap`)
        assert.ok(shift[1] + padded[1] <= output[1], `${mode} ${size} second strip bottom`)
      }
    }
  })
})

describe("fitTitle", () => {
  const layout = { width: 100, height: 50, left: 10, top: 5 }

  test("a wide title fills the width and centres vertically", () => {
    assert.deepEqual(fitTitle(layout, 200, 50), { scale: 0.5, x: 10, y: 17.5 })
  })

  test("a tall title fills the height and centres horizontally", () => {
    assert.deepEqual(fitTitle(layout, 50, 100), { scale: 0.5, x: 47.5, y: 5 })
  })

  test("a small title scales up to fit", () => {
    assert.deepEqual(fitTitle(layout, 10, 5), { scale: 10, x: 10, y: 5 })
  })

  test("a typical title fits the 1.20 strip", () => {
    const { scale, x, y } = fitTitle(minecraftLayout("1.20", 1024), 1000, 100)
    close(scale, 1.024)
    close(x, 0)
    close(y, 36.8)
  })

  test("the fitted title never leaves the layout", () => {
    for (const mode of ["1.20", "1.19", "mojang"]) {
      const target = minecraftLayout(mode, 1024)
      for (const [width, height] of [[1, 1], [4000, 10], [10, 4000], [640, 360]]) {
        const { scale, x, y } = fitTitle(target, width, height)
        assert.ok(x >= target.left - 1e-9 && x + width * scale <= target.left + target.width + 1e-9, `${mode} ${width}x${height} horizontally`)
        assert.ok(y >= target.top - 1e-9 && y + height * scale <= target.top + target.height + 1e-9, `${mode} ${width}x${height} vertically`)
      }
    }
  })
})

describe("outputSize", () => {
  const image = { width: 400, height: 200 }

  test("square uses the longest side whatever the padding", () => {
    assert.deepEqual(outputSize(image, { tab: "square" }, 0), [400, 400])
    assert.deepEqual(outputSize(image, { tab: "square" }, 50), [400, 400])
    assert.deepEqual(outputSize({ width: 100, height: 300 }, { tab: "square" }, 0), [300, 300])
  })

  test("custom uses the chosen size whatever the image", () => {
    assert.deepEqual(outputSize(image, { tab: "custom", width: 1920, height: 1080 }, 30), [1920, 1080])
  })

  test("normal without padding keeps the image size", () => {
    assert.deepEqual(outputSize(image, { tab: "normal" }, 0), [400, 200])
  })

  test("normal padding keeps the longest side and grows the other", () => {
    assert.deepEqual(outputSize(image, { tab: "normal" }, 10), [400, 210])
    assert.deepEqual(outputSize({ width: 200, height: 400 }, { tab: "normal" }, 10), [210, 400])
  })

  test("normal never squeezes the short side below one pixel", () => {
    assert.deepEqual(outputSize({ width: 1000, height: 1 }, { tab: "normal" }, 499), [1000, 999])
  })
})

describe("aspectOf", () => {
  test("reduces to the lowest terms", () => {
    assert.deepEqual(aspectOf(1920, 1080), [16, 9])
    assert.deepEqual(aspectOf(1080, 1920), [9, 16])
    assert.deepEqual(aspectOf(100, 100), [1, 1])
  })

  test("leaves coprime sizes alone", () => {
    assert.deepEqual(aspectOf(7, 13), [7, 13])
  })
})

describe("fromAspect", () => {
  test("by width derives the height", () => {
    assert.deepEqual(fromAspect(16, 9, 1920, 999, true, Infinity), [1920, 1080])
  })

  test("by height derives the width", () => {
    assert.deepEqual(fromAspect(16, 9, 999, 1080, false, Infinity), [1920, 1080])
  })

  test("rounds the derived side down", () => {
    assert.deepEqual(fromAspect(3, 2, 100, 0, true, Infinity), [100, 66])
    assert.deepEqual(fromAspect(3, 2, 0, 100, false, Infinity), [150, 100])
    assert.deepEqual(fromAspect(2, 3, 0, 100, false, Infinity), [66, 100])
  })

  test("a derived side over the limit caps it and shrinks the other side", () => {
    assert.deepEqual(fromAspect(1, 2, 5000, 0, true, 8192), [4096, 8192])
    assert.deepEqual(fromAspect(2, 1, 0, 5000, false, 8192), [8192, 4096])
  })

  test("a derived side exactly on the limit is kept", () => {
    assert.deepEqual(fromAspect(1, 1, 8192, 0, true, 8192), [8192, 8192])
    assert.deepEqual(fromAspect(1, 1, 0, 8192, false, 8192), [8192, 8192])
  })

  test("extreme aspects can round a side down to zero", () => {
    assert.deepEqual(fromAspect(1000, 1, 500, 0, true, Infinity), [500, 0])
    assert.deepEqual(fromAspect(1, 1000, 0, 500, false, Infinity), [0, 500])
  })

  test("restores a size from its reduced aspect", () => {
    for (const [width, height] of [[1920, 1080], [1366, 768], [1, 1], [8192, 4608], [1000, 3]]) {
      const [aspectWidth, aspectHeight] = aspectOf(width, height)
      assert.deepEqual(fromAspect(aspectWidth, aspectHeight, width, 0, true, Infinity), [width, height])
      assert.deepEqual(fromAspect(aspectWidth, aspectHeight, 0, height, false, Infinity), [width, height])
    }
  })
})
