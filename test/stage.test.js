import { afterEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"

globalThis.localStorage = { getItem: () => null, setItem: () => {} }
globalThis.devicePixelRatio = 1

const { UNTURNED, UNZOOMED, cornersOf, elevationOf, frameCamera, gizmoPose, lineBounds, movedBy, orbitCamera, panMatrix, pannedBy, pickEntry, placementMatrix, rotatedTo, sortEntries, titleFraming, turnedBy, wordMovedBy, wordPose, wordRotatedTo, zoomedAt } = await import("../src/lib/stage.js")
const { view } = await import("../src/lib/view.js")

const BOUNDS = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 4, 2))
const WIDE = new THREE.Box3(new THREE.Vector3(-30, 0, 0), new THREE.Vector3(30, 20, 10))
const DIRECTION = new THREE.Vector3(0, -0.51007, 0.86013).normalize()

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

function closeList(actual, expected, tolerance = 1e-6) {
  const list = actual.toArray ? actual.toArray() : actual
  assert.equal(list.length, expected.length)
  for (const [index, value] of list.entries()) close(value, expected[index], tolerance)
}

function radians(degrees) {
  return degrees * Math.PI / 180
}

function point(x, y, z) {
  return new THREE.Vector3(x, y, z)
}

function transform(overrides) {
  return { rotation: 0, offset: [0, 0, 0], type: [1, 1, 1], scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0], anchor: { y: "middle", z: "middle" }, outlineGrow: [1, 1, 1], word: { scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0] }, ...overrides }
}

function tilted(overrides) {
  return transform({ rotation: 90, type: [0.78042, 1.67665, 0.77035], offset: [0, -40, -2], anchor: { y: "top", z: "front" }, scale: [1.5, 0.8, 1.2], rotate: [20, -35, 10], translate: [5, -3, 8], ...overrides })
}

function builtOf(min, max, lineMin = min, lineMax = max) {
  return { line: { min: lineMin, max: lineMax }, body: { triangles: 2, positions: new Float32Array(min.concat(max)) } }
}

function shellOf(min, max, scale = [1, 1, 1]) {
  return { triangles: 2, positions: new Float32Array(min.concat(max)), scale }
}

function moved(position, value) {
  return position.clone().applyMatrix4(placementMatrix(value, BOUNDS))
}

function turning(x, y, z, rotation = 0) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(radians(x), radians(y), radians(z))).multiply(new THREE.Quaternion().setFromAxisAngle(point(1, 0, 0), radians(rotation)))
}

function middle(corners) {
  return corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(corners.length)
}

describe("placementMatrix", () => {
  test("a default transform leaves points alone", () => {
    closeList(moved(point(3, 2, 1), transform()), [3, 2, 1])
  })

  test("applies type, then offset, then the placement tilt", () => {
    const matrix = placementMatrix(transform({ rotation: 90, offset: [0, 1, 0], type: [2, 1, 1] }), null)
    closeList(point(1, 0, 0).applyMatrix4(matrix), [2, 0, 1])
  })

  test("scales around a bottom back anchor", () => {
    const value = transform({ scale: [2, 2, 2], anchor: { y: "bottom", z: "back" } })
    closeList(moved(point(5, 0, 0), value), [5, 0, 0])
    closeList(moved(point(10, 4, 2), value), [15, 8, 4])
  })

  test("scales around a top front anchor", () => {
    const value = transform({ scale: [2, 2, 2], anchor: { y: "top", z: "front" } })
    closeList(moved(point(5, 4, 2), value), [5, 4, 2])
    closeList(moved(point(0, 0, 0), value), [-5, -4, -2])
  })

  test("any other anchor scales around the centre", () => {
    const value = transform({ scale: [2, 2, 2] })
    closeList(moved(point(5, 2, 1), value), [5, 2, 1])
    closeList(moved(point(10, 4, 2), value), [15, 6, 3])
  })

  test("the anchor stays put under the type and tilt of a real line", () => {
    const rest = tilted({ scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0] })
    const anchor = point(5, 4, 2)
    closeList(moved(anchor, { ...rest, scale: [2, 3, 0.5] }), moved(anchor, rest).toArray())
  })

  test("scale stretches the placed axes rather than the world axes", () => {
    const box = new THREE.Box3(point(-1, -1, -1), point(1, 1, 1))
    const matrix = placementMatrix(transform({ rotation: 90, scale: [1, 2, 1] }), box)
    closeList(point(0, 1, 0).applyMatrix4(matrix), [0, 0, 2])
    closeList(point(0, 0, 1).applyMatrix4(matrix), [0, -1, 0])
  })

  test("rotates around the centre of the line", () => {
    const value = transform({ rotate: [0, 90, 0] })
    closeList(moved(point(5, 2, 1), value), [5, 2, 1])
    closeList(moved(point(10, 2, 1), value), [5, 2, -4])
  })

  test("rotates around the centre after scaling moved it", () => {
    const value = transform({ scale: [2, 2, 2], anchor: { y: "bottom", z: "back" }, rotate: [0, 90, 0] })
    closeList(moved(point(5, 2, 1), value), [5, 4, 2])
  })

  test("translate follows the rotated axes", () => {
    closeList(moved(point(5, 2, 1), transform({ rotate: [0, 90, 0], translate: [3, 0, 0] })), [5, 2, -2])
  })

  test("translate follows the placement tilt", () => {
    const box = new THREE.Box3(point(-1, -1, -1), point(1, 1, 1))
    const matrix = placementMatrix(transform({ rotation: 90, translate: [0, 1, 0] }), box)
    closeList(new THREE.Vector3().applyMatrix4(matrix), [0, 0, 1])
  })

  test("without bounds everything happens around the origin", () => {
    const matrix = placementMatrix(transform({ rotate: [0, 90, 0], scale: [2, 2, 2] }), null)
    closeList(point(1, 0, 0).applyMatrix4(matrix), [0, 0, -2])
  })
})

describe("lineBounds", () => {
  test("reads the box from the built line", () => {
    const box = lineBounds(builtOf([0, 0, 0], [1, 1, 1], [-2, -3, -4], [2, 3, 4]))
    closeList(box.min, [-2, -3, -4])
    closeList(box.max, [2, 3, 4])
  })
})

describe("gizmoPose", () => {
  test("sits on the centre of the placed line", () => {
    closeList(gizmoPose(transform({ scale: [2, 2, 2], anchor: { y: "bottom", z: "back" }, translate: [1, 0, 0] }), BOUNDS).position, [6, 4, 2])
  })

  test("turns by the placement tilt first and the user rotation second", () => {
    const { quaternion } = gizmoPose(transform({ rotation: 90, rotate: [0, 0, 90] }), BOUNDS)
    closeList(point(1, 0, 0).applyQuaternion(quaternion), [0, 1, 0])
    closeList(point(0, 1, 0).applyQuaternion(quaternion), [0, 0, 1])
  })
})

describe("movedBy", () => {
  test("converts a world move into translate", () => {
    const { translate, offset } = movedBy(transform(), point(1, 2, 3))
    assert.deepEqual(translate, [1, 2, 3])
    closeList(offset, [1, 2, 3])
  })

  test("undoes the rotation", () => {
    const { translate, offset } = movedBy(transform({ rotate: [0, 90, 0] }), point(0, 0, -3))
    closeList(translate, [3, 0, 0])
    closeList(offset, [0, 0, -3])
  })

  test("adds to the existing translate", () => {
    assert.deepEqual(movedBy(transform({ translate: [10, 20, 30] }), point(1, 2, 3)).translate, [11, 22, 33])
  })

  test("rounds translate and reports the rounded move", () => {
    const { translate, offset } = movedBy(transform(), point(1.234, 0, 0))
    assert.deepEqual(translate, [1.23, 0, 0])
    closeList(offset, [1.23, 0, 0])
  })

  test("moves past the slider range", () => {
    const { translate, offset } = movedBy(transform({ translate: [199, -199, 0] }), point(5, -5, 0))
    assert.deepEqual(translate, [204, -204, 0])
    closeList(offset, [5, -5, 0])
  })

  test("the gizmo lands where the returned offset says", () => {
    const value = tilted()
    const { translate, offset } = movedBy(value, point(12.34, -5.6, 7.8))
    const before = gizmoPose(value, WIDE).position
    const after = gizmoPose({ ...value, translate }, WIDE).position
    closeList(after.sub(before), offset.toArray())
    closeList(offset, [12.34, -5.6, 7.8], 0.02)
  })
})

describe("rotatedTo", () => {
  test("reads the gizmo rotation back", () => {
    for (const rotate of [[0, 0, 0], [20, -35, 10], [30, 120, -60], [170, 170, 170], [-120, 45, 100]]) {
      const value = tilted({ rotate })
      closeList(rotatedTo(value, gizmoPose(value, WIDE).quaternion).rotate, rotate, 0.011)
    }
  })

  test("keeps the translate when nothing turned", () => {
    const value = tilted()
    closeList(rotatedTo(value, gizmoPose(value, WIDE).quaternion).translate, value.translate, 0.011)
  })

  test("carries on past ninety degrees rather than flipping", () => {
    const { rotate } = rotatedTo(transform({ rotate: [0, 89, 0] }), turning(0, 91, 0))
    closeList(rotate, [0, 91, 0], 0.011)
  })

  test("rounds to two places", () => {
    closeList(rotatedTo(transform(), turning(33.337, 0, 0)).rotate, [33.34, 0, 0], 1e-9)
  })

  test("re-expresses translate so the line stays put", () => {
    const { rotate, translate } = rotatedTo(transform({ translate: [10, 0, 0] }), turning(0, 90, 0))
    closeList(rotate, [0, 90, 0], 0.011)
    closeList(translate, [0, 0, 10], 0.011)
  })

  test("the gizmo stays in place and takes the new rotation", () => {
    const value = tilted()
    const quaternion = turning(50, 130, -70, 90)
    const before = gizmoPose(value, WIDE).position
    const after = gizmoPose({ ...value, ...rotatedTo(value, quaternion) }, WIDE)
    closeList(after.position, before.toArray(), 0.03)
    assert.ok(after.quaternion.angleTo(quaternion) < 1e-3)
  })

  test("keeps a translate past the slider range after turning", () => {
    const { translate } = rotatedTo(transform({ translate: [200, 200, 0] }), turning(0, 0, 45))
    closeList(translate, [282.84, 0, 0], 0.011)
  })
})

describe("wordPose", () => {
  const built = builtOf([2, 0, 0], [4, 2, 1], [0, 0, 0], [10, 4, 2])

  test("sits on the word centre", () => {
    closeList(wordPose(transform(), built, false).position, [3, 1, 0.5])
  })

  test("adds the word translate", () => {
    closeList(wordPose(transform({ word: { scale: [1, 1, 1], rotate: [0, 0, 0], translate: [1, 0, 0] } }), built, false).position, [4, 1, 0.5])
  })

  test("follows the word scale around its anchor", () => {
    const value = transform({ anchor: { y: "bottom", z: "back" }, word: { scale: [2, 2, 2], rotate: [0, 0, 0], translate: [0, 0, 0] } })
    closeList(wordPose(value, built, false).position, [3, 2, 1])
  })

  test("only includes the word rotation when turned", () => {
    const value = transform({ rotation: 90, word: { scale: [1, 1, 1], rotate: [0, 0, 90], translate: [0, 0, 0] } })
    closeList(point(1, 0, 0).applyQuaternion(wordPose(value, built, false).quaternion), [1, 0, 0])
    closeList(point(1, 0, 0).applyQuaternion(wordPose(value, built, true).quaternion), [0, 0, 1])
  })

  test("matches the centre of the placed word", () => {
    const wordBuilt = builtOf([-10, 0, 0], [10, 20, 10], [-30, 0, 0], [30, 20, 10])
    const value = tilted({ word: { scale: [1.5, 0.5, 2], rotate: [15, 25, -40], translate: [3, -2, 6] } })
    const { corners } = titleFraming([{ type: "top", built: wordBuilt, transform: value }])
    closeList(wordPose(value, wordBuilt, true).position, middle(corners).toArray(), 1e-4)
  })
})

describe("wordMovedBy", () => {
  const built = builtOf([-10, 0, 0], [10, 20, 10], [-30, 0, 0], [30, 20, 10])

  test("divides the move by the line scale", () => {
    const { translate, position } = wordMovedBy(transform({ scale: [2, 2, 2] }), built, point(2, 0, 0))
    assert.deepEqual(translate, [1, 0, 0])
    closeList(position, [2, 10, 5])
  })

  test("undoes the line rotation", () => {
    closeList(wordMovedBy(transform({ rotate: [0, 90, 0] }), built, point(0, 0, -3)).translate, [3, 0, 0])
  })

  test("the returned position is where the word ends up", () => {
    const value = tilted({ word: { scale: [1.2, 1, 0.9], rotate: [10, 0, -5], translate: [1, 2, 3] } })
    const offset = point(9.1, -4.2, 3.3)
    const { translate, position } = wordMovedBy(value, built, offset)
    const before = wordPose(value, built, false).position
    closeList(wordPose({ ...value, word: { ...value.word, translate } }, built, false).position, position.toArray())
    closeList(position.clone().sub(before), offset.toArray(), 0.05)
  })

  test("moves past the slider range and reports the real position", () => {
    const value = transform({ word: { scale: [1, 1, 1], rotate: [0, 0, 0], translate: [199.5, 0, 0] } })
    const { translate, position } = wordMovedBy(value, built, point(5, 0, 0))
    assert.deepEqual(translate, [204.5, 0, 0])
    closeList(position, [204.5, 10, 5])
  })
})

describe("wordRotatedTo", () => {
  const built = builtOf([-10, 0, 0], [10, 20, 10], [-30, 0, 0], [30, 20, 10])

  test("reads the turned word pose back", () => {
    for (const rotate of [[0, 0, 0], [30, -50, 70], [170, 170, 170], [10, 120, -20]]) {
      const value = tilted({ word: { scale: [1, 1, 1], rotate, translate: [0, 0, 0] } })
      closeList(wordRotatedTo(value, wordPose(value, built, true).quaternion), rotate, 0.011)
    }
  })

  test("is relative to the line rotation", () => {
    const value = transform({ rotate: [0, 40, 0] })
    closeList(wordRotatedTo(value, turning(0, 70, 0)), [0, 30, 0], 0.011)
  })
})

describe("cornersOf", () => {
  test("lists the eight corners of the box", () => {
    const box = new THREE.Box3(point(-1, -2, -3), point(1, 2, 3))
    const corners = cornersOf(box)
    assert.equal(corners.length, 8)
    assert.equal(new Set(corners.map(corner => corner.toArray().join())).size, 8)
    assert.ok(new THREE.Box3().setFromPoints(corners).equals(box))
  })
})

describe("titleFraming", () => {
  afterEach(() => {
    view.fixedDistance = false
  })

  const flat = builtOf([0, 0, 0], [3, 4, 0])

  test("is null with nothing built", () => {
    assert.equal(titleFraming([]), null)
    assert.equal(titleFraming([{ type: "top", built: null, transform: transform() }]), null)
    assert.equal(titleFraming([{ type: "top", built: { line: flat.line, body: { triangles: 0, positions: new Float32Array() } }, transform: transform() }]), null)
    assert.equal(titleFraming([{ type: "top", built: flat, transform: null }]), null)
  })

  test("size is the diagonal of the placed title", () => {
    assert.equal(titleFraming([{ type: "top", built: flat, transform: transform() }]).size, 5)
  })

  test("has eight corners per usable item", () => {
    const items = [{ type: "top", built: flat, transform: transform() }, { type: "bottom", built: null, transform: transform() }, { type: "bottom", built: flat, transform: transform() }]
    assert.equal(titleFraming(items).corners.length, 16)
  })

  test("corners and size follow the user transform", () => {
    const { corners, size } = titleFraming([{ type: "top", built: flat, transform: transform() }, { type: "bottom", built: flat, transform: transform({ translate: [50, 0, 0] }) }])
    assert.equal(Math.max(...corners.map(corner => corner.x)), 53)
    close(size, Math.hypot(53, 4))
  })

  test("the anchor ignores the user transform", () => {
    const value = transform({ scale: [3, 3, 3], rotate: [10, 20, 30], translate: [50, 60, 70] })
    const { anchor } = titleFraming([{ type: "top", built: flat, transform: value }])
    closeList(anchor.min, [0, 0, 0])
    closeList(anchor.max, [3, 4, 0])
  })

  test("the anchor keeps the placement", () => {
    const { anchor } = titleFraming([{ type: "top", built: flat, transform: transform({ offset: [1, 2, 3] }) }])
    closeList(anchor.min, [1, 2, 3])
    closeList(anchor.max, [4, 6, 3])
  })

  test("the anchor only uses top text when there is some", () => {
    const items = [{ type: "top", built: flat, transform: transform() }, { type: "bottom", built: builtOf([0, -50, 0], [100, 0, 0]), transform: transform() }]
    const { anchor } = titleFraming(items)
    closeList(anchor.min, [0, 0, 0])
    closeList(anchor.max, [3, 4, 0])
  })

  test("the anchor uses everything when there is no top text", () => {
    const items = [{ type: "bottom", built: flat, transform: transform() }, { type: "small", built: builtOf([0, -50, 0], [100, 0, 0]), transform: transform() }]
    const { anchor } = titleFraming(items)
    closeList(anchor.min, [0, -50, 0])
    closeList(anchor.max, [100, 4, 0])
  })

  test("the outline widens the corners once and the anchor by its growth", () => {
    const built = builtOf([0, 0, 0], [10, 10, 10])
    const { anchor, corners } = titleFraming([{ type: "top", built, outline: shellOf([-1, -1, -1], [11, 11, 11]), transform: transform({ outlineGrow: [2, 1, 3] }) }])
    closeList(anchor.min, [-2, -1, -3])
    closeList(anchor.max, [12, 11, 13])
    assert.equal(Math.min(...corners.map(corner => corner.x)), -1)
    assert.equal(Math.max(...corners.map(corner => corner.x)), 11)
  })

  test("the outline is divided by its own scale", () => {
    const built = builtOf([0, 0, 0], [10, 10, 10])
    const { corners } = titleFraming([{ type: "top", built, outline: shellOf([-2, -1, -1], [22, 11, 11], [2, 1, 1]), transform: transform() }])
    assert.equal(Math.min(...corners.map(corner => corner.x)), -1)
    assert.equal(Math.max(...corners.map(corner => corner.x)), 11)
  })

  test("a halo takes over from the outline", () => {
    const built = builtOf([0, 0, 0], [10, 10, 10])
    const { corners } = titleFraming([{ type: "top", built, outline: shellOf([-1, -1, -1], [11, 11, 11]), halo: shellOf([-5, -5, -5], [15, 15, 15]), transform: transform() }])
    assert.equal(Math.min(...corners.map(corner => corner.x)), -5)
  })

  test("reach is only set for a fixed distance", () => {
    const items = [{ type: "top", built: flat, transform: transform() }]
    assert.equal(titleFraming(items).reach, null)
    view.fixedDistance = true
    assert.equal(titleFraming(items).reach, 144)
  })
})

describe("frameCamera", () => {
  const anchor = new THREE.Box3(point(-40, -5, -3), point(40, 15, 3))
  const corners = cornersOf(anchor)
  const size = anchor.getSize(new THREE.Vector3()).length()
  const line = new THREE.Box3(point(-10, 0, 0), point(10, 0, 0))

  function cameras() {
    return [new THREE.OrthographicCamera(), new THREE.PerspectiveCamera()]
  }

  function extent(camera, points) {
    const projected = points.map(corner => corner.clone().project(camera))
    const xs = projected.map(corner => corner.x)
    const ys = projected.map(corner => corner.y)
    const zs = projected.map(corner => corner.z)
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  }

  function tanHalf(camera) {
    return Math.tan(camera.fov * Math.PI / 360)
  }

  test("a wide view fits the title height to 94 percent and centres it", () => {
    for (const camera of cameras()) {
      frameCamera(camera, { anchor, corners, size, fov: 43, width: 4000, height: 200 })
      const { minX, maxX, minY, maxY } = extent(camera, corners)
      close(maxY - minY, 1.88, 1e-6)
      close(minY + maxY, 0, 1e-6)
      close(minX + maxX, 0, 1e-6)
      assert.ok(maxX - minX < 1.88)
    }
  })

  test("a narrow view fits the title width to 94 percent and centres it", () => {
    for (const camera of cameras()) {
      frameCamera(camera, { anchor, corners, size, fov: 43, width: 200, height: 800 })
      const { minX, maxX, minY, maxY } = extent(camera, corners)
      close(maxX - minX, 1.88, 1e-6)
      close(minX + maxX, 0, 1e-6)
      close(minY + maxY, 0, 1e-6)
      assert.ok(maxY - minY < 1.88)
    }
  })

  test("corners moved off the anchor are still framed", () => {
    const shifted = corners.map(corner => corner.clone().add(point(30, 20, 10)))
    for (const camera of cameras()) {
      frameCamera(camera, { anchor, corners: shifted, size, fov: 43, width: 800, height: 600 })
      const { minX, maxX, minY, maxY } = extent(camera, shifted)
      close(minX + maxX, 0, 1e-6)
      close(minY + maxY, 0, 1e-6)
      close(Math.max(maxX - minX, maxY - minY), 1.88, 1e-6)
    }
  })

  test("every corner sits between the near and far planes", () => {
    for (const camera of cameras()) {
      frameCamera(camera, { anchor, corners, size, fov: 43, width: 800, height: 600 })
      const { minZ, maxZ } = extent(camera, corners)
      assert.ok(minZ > -1 && maxZ < 1, `${camera.type} depth ${minZ} to ${maxZ}`)
    }
  })

  test("the camera looks at the anchor from below and in front", () => {
    const target = anchor.getCenter(new THREE.Vector3())
    for (const camera of cameras()) {
      frameCamera(camera, { anchor, corners, size, fov: 43, width: 800, height: 600 })
      closeList(camera.position.clone().sub(target).normalize(), DIRECTION.toArray())
    }
  })

  test("orthographic stands back twice the title size", () => {
    const camera = new THREE.OrthographicCamera()
    frameCamera(camera, { anchor, corners, size, fov: 43, width: 800, height: 600 })
    close(camera.position.distanceTo(anchor.getCenter(new THREE.Vector3())), size * 2)
    close(camera.near, size * 2 / 100)
    close(camera.far, size * 200)
  })

  test("perspective stands back far enough for the anchor width at the given fov", () => {
    const camera = new THREE.PerspectiveCamera()
    frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, fov: 90, width: 800, height: 600 })
    close(camera.position.distanceTo(new THREE.Vector3()), 10)
  })

  test("perspective adds the front of the anchor to the distance", () => {
    const camera = new THREE.PerspectiveCamera()
    const deep = new THREE.Box3(point(-10, 0, -1), point(10, 0, 1))
    const target = new THREE.Vector3()
    frameCamera(camera, { anchor: deep, corners: cornersOf(deep), size: 20, fov: 90, width: 800, height: 600 })
    close(camera.position.distanceTo(target), 10 + DIRECTION.z)
  })

  test("perspective is tilted by the title angle, orthographic is not", () => {
    const target = anchor.getCenter(new THREE.Vector3())
    const flat = new THREE.OrthographicCamera()
    frameCamera(flat, { anchor, corners, size, fov: 43, width: 800, height: 600 })
    close(flat.getWorldDirection(new THREE.Vector3()).angleTo(target.clone().sub(flat.position)), 0, 1e-6)
    const deep = new THREE.PerspectiveCamera()
    frameCamera(deep, { anchor, corners, size, fov: 43, width: 800, height: 600 })
    const direction = deep.getWorldDirection(new THREE.Vector3())
    const towards = target.clone().sub(deep.position).normalize()
    close(direction.angleTo(towards), radians(7.285), 1e-6)
    assert.ok(direction.y > towards.y)
  })

  test("a fixed reach sets the distance whatever the title width", () => {
    for (const half of [1, 10, 500]) {
      const camera = new THREE.PerspectiveCamera()
      const box = new THREE.Box3(point(-half, 0, 0), point(half, 0, 0))
      frameCamera(camera, { anchor: box, corners: cornersOf(box), size: half * 2, fov: 90, width: 800, height: 600, reach: 144 })
      close(camera.position.length(), 144)
    }
  })

  test("a fixed reach backs off from corners moved towards the camera", () => {
    const camera = new THREE.PerspectiveCamera()
    const ahead = DIRECTION.clone().multiplyScalar(200)
    frameCamera(camera, { anchor: line, corners: cornersOf(line).concat(ahead), size: 200, fov: 90, width: 800, height: 600, reach: 144 })
    close(camera.position.length(), 344)
  })

  test("maxScale limits orthographic magnification", () => {
    const camera = new THREE.OrthographicCamera()
    frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, fov: 90, width: 800, height: 600, maxScale: 2 })
    close(camera.top - camera.bottom, 300)
    close(camera.right - camera.left, 400)
  })

  test("maxScale limits perspective magnification at the camera distance", () => {
    const camera = new THREE.PerspectiveCamera()
    frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, fov: 90, width: 800, height: 600, maxScale: 2 })
    close(600 / (2 * tanHalf(camera) * 10), 2)
  })

  test("a frame is centred instead of the title", () => {
    const frame = {
      rect: title => ({ left: -title.width, top: 0, width: title.width * 2, height: title.height }),
      bounds: title => ({ left: -title.width, top: 0, width: title.width * 2, height: title.height }),
      pixels: () => 1e6
    }
    const box = new THREE.Box3(point(-20, 0, 0), point(20, 2, 0))
    const points = cornersOf(box)
    for (const camera of cameras()) {
      frameCamera(camera, { anchor: box, corners: points, size: 40, fov: 43, width: 800, height: 600, frame })
      const { minX, maxX, minY, maxY } = extent(camera, points)
      close(minX, 0, 1e-6)
      close(maxX, 0.94, 1e-6)
      close(minY + maxY, 0, 1e-6)
    }
  })

  test("a frame hands the measured title and its rect to pixels", () => {
    const seen = []
    const output = { left: 0, top: 0, width: 1, height: 1 }
    function pixels(title, rect) {
      seen.push(title, rect)
      return 1e6
    }
    const frame = { rect: () => output, bounds: title => title, pixels }
    const camera = new THREE.OrthographicCamera()
    frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, fov: 43, width: 800, height: 600, frame })
    assert.equal(seen[1], output)
    close(seen[0].width, 20)
    assert.equal(seen[0].left, 0)
    assert.equal(seen[0].top, 0)
  })

  test("a frame stops the view going past one output pixel per device pixel", () => {
    globalThis.devicePixelRatio = 2
    const frame = { rect: title => title, bounds: title => title, pixels: () => 0.5 }
    const camera = new THREE.OrthographicCamera()
    frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, fov: 43, width: 800, height: 600, frame })
    globalThis.devicePixelRatio = 1
    close(camera.top - camera.bottom, 2400)
  })
})

describe("zoom and pan", () => {
  function shown(pan, x, y) {
    const point = new THREE.Vector3(x, y, 0).applyMatrix4(panMatrix(pan))
    return [point.x, point.y]
  }

  test("starts as no change at all", () => {
    assert.ok(panMatrix(UNZOOMED).equals(new THREE.Matrix4()))
  })

  test("zooming keeps the point under the cursor where it is", () => {
    const pan = zoomedAt(UNZOOMED, 2, 0.5, -0.25)
    assert.equal(pan.scale, 2)
    const point = shown(pan, 0.5, -0.25)
    assert.ok(Math.abs(point[0] - 0.5) < 1e-9 && Math.abs(point[1] + 0.25) < 1e-9)
  })

  test("zooming again still keeps the point under the cursor", () => {
    const first = zoomedAt(UNZOOMED, 2, 0.5, 0)
    const second = zoomedAt(first, 3, -0.2, 0.4)
    const before = new THREE.Vector3(-0.2, 0.4, 0).applyMatrix4(panMatrix(first).invert())
    const after = before.applyMatrix4(panMatrix(second))
    assert.ok(Math.abs(after.x + 0.2) < 1e-9 && Math.abs(after.y - 0.4) < 1e-9)
  })

  test("zoom stops at its limits", () => {
    assert.equal(zoomedAt(UNZOOMED, 1000, 0, 0).scale, 32)
    assert.equal(zoomedAt(UNZOOMED, 0.001, 0, 0).scale, 0.25)
  })

  test("a limited zoom does not move the view", () => {
    const pan = zoomedAt(zoomedAt(UNZOOMED, 32, 0.1, 0.1), 2, 0.5, 0.5)
    assert.deepEqual(pan, zoomedAt(UNZOOMED, 32, 0.1, 0.1))
  })

  test("panning moves the content the same way as the drag", () => {
    const [x, y] = shown(pannedBy(UNZOOMED, 0.25, -0.5), 0, 0)
    assert.equal(x, 0.25)
    assert.equal(y, -0.5)
  })

  test("panning cannot lose the middle of the title", () => {
    assert.deepEqual(pannedBy(UNZOOMED, 5, -5), { scale: 1, x: 1, y: -1 })
    assert.deepEqual(pannedBy({ scale: 4, x: 0, y: 0 }, 5, -5), { scale: 4, x: 4, y: -4 })
  })

  test("the matrix leaves depth alone and scales from the middle of the screen", () => {
    const point = new THREE.Vector4(0.5, 0.5, 0.25, 2).applyMatrix4(panMatrix({ scale: 2, x: 0.1, y: 0 }))
    assert.deepEqual(point.toArray(), [1.2, 1, 0.25, 2])
  })
})

describe("orbiting", () => {
  function framed() {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, -50, 200)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    return camera
  }

  const pivot = new THREE.Vector3(0, 0, 0)

  function onScreen(camera, point) {
    return point.clone().applyMatrix4(camera.matrixWorldInverse.copy(camera.matrixWorld).invert())
  }

  test("no turn leaves the camera where it was", () => {
    const camera = framed()
    orbitCamera(camera, pivot, UNTURNED)
    assert.ok(camera.position.distanceTo(new THREE.Vector3(0, -50, 200)) < 1e-9)
  })

  test("the pivot stays at the same place in view", () => {
    const camera = framed()
    const centre = new THREE.Vector3(10, 5, -3)
    const before = onScreen(camera, centre)
    orbitCamera(camera, centre, { yaw: 0.7, pitch: -0.4 })
    assert.ok(onScreen(camera, centre).distanceTo(before) < 1e-9)
  })

  test("keeps the same distance from the pivot", () => {
    const camera = framed()
    const distance = camera.position.length()
    orbitCamera(camera, pivot, { yaw: 2, pitch: 1 })
    assert.ok(Math.abs(camera.position.length() - distance) < 1e-9)
  })

  test("dragging right swings the camera left", () => {
    const camera = framed()
    orbitCamera(camera, pivot, turnedBy(UNTURNED, 0.5, 0))
    assert.ok(camera.position.x < 0)
  })

  test("dragging down lifts the camera", () => {
    const camera = framed()
    orbitCamera(camera, pivot, turnedBy(UNTURNED, 0, 0.5))
    assert.ok(camera.position.y > -50)
  })

  test("stops at straight up and straight down from any starting angle", () => {
    const camera = framed()
    const start = elevationOf(camera.position, pivot)
    assert.ok(start < 0)
    const up = framed()
    orbitCamera(up, pivot, turnedBy(UNTURNED, 0, 100, start))
    assert.ok(Math.abs(elevationOf(up.position, pivot) - Math.PI / 2) < 1e-6)
    const down = framed()
    orbitCamera(down, pivot, turnedBy(UNTURNED, 0, -100, start))
    assert.ok(Math.abs(elevationOf(down.position, pivot) + Math.PI / 2) < 1e-6)
  })

  test("elevation is measured from level around the pivot", () => {
    const pivotAbove = new THREE.Vector3(5, 10, 0)
    assert.equal(elevationOf(new THREE.Vector3(5, 10, 100), pivotAbove), 0)
    assert.ok(Math.abs(elevationOf(new THREE.Vector3(5, 110, 0), pivotAbove) - Math.PI / 2) < 1e-9)
  })

  test("yaw has no limit", () => {
    assert.equal(turnedBy(UNTURNED, 100, 0).yaw, -100)
  })
})

describe("sortEntries", () => {
  function entryAt(z, line, parts = { outline: true, solid: true }) {
    const group = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    mesh.position.z = z
    group.add(mesh)
    return { group, line, outline: parts.outline ? { renderOrder: null } : null, solid: parts.solid ? { renderOrder: null } : null, halo: parts.halo ? { renderOrder: null } : null, holes: parts.holes ? { renderOrder: null } : null }
  }

  const camera = new THREE.PerspectiveCamera()

  test("paints far words first, outlines before solids", () => {
    const near = entryAt(2, "a")
    const far = entryAt(10, "a")
    sortEntries([near, far], camera)
    assert.deepEqual([far.outline.renderOrder, near.outline.renderOrder, far.solid.renderOrder, near.solid.renderOrder], [0, 1, 2, 3])
  })

  test("keeps a line together, ordered by its average distance", () => {
    const nearest = entryAt(2, "split")
    const far = entryAt(10, "split")
    const between = entryAt(5, "single")
    sortEntries([between, nearest, far], camera)
    assert.deepEqual([far.outline.renderOrder, nearest.outline.renderOrder, far.solid.renderOrder, nearest.solid.renderOrder, between.outline.renderOrder, between.solid.renderOrder], [0, 1, 2, 3, 4, 5])
  })

  test("the closer line goes last whatever the input order", () => {
    const front = entryAt(3, "front")
    const back = entryAt(30, "back")
    sortEntries([front, back], camera)
    assert.deepEqual([back.outline.renderOrder, back.solid.renderOrder, front.outline.renderOrder, front.solid.renderOrder], [0, 1, 2, 3])
    sortEntries([back, front], camera)
    assert.deepEqual([back.outline.renderOrder, back.solid.renderOrder, front.outline.renderOrder, front.solid.renderOrder], [0, 1, 2, 3])
  })

  test("distance follows the camera", () => {
    const one = entryAt(-10, "one")
    const two = entryAt(10, "two")
    const roaming = new THREE.PerspectiveCamera()
    roaming.position.z = 8
    sortEntries([one, two], roaming)
    assert.deepEqual([one.solid.renderOrder, two.solid.renderOrder], [1, 3])
    roaming.position.z = -8
    sortEntries([one, two], roaming)
    assert.deepEqual([one.solid.renderOrder, two.solid.renderOrder], [3, 1])
  })

  test("holes and halos always go underneath without using up an order", () => {
    const entry = entryAt(5, "a", { outline: true, solid: true, halo: true, holes: true })
    const other = entryAt(50, "b", { outline: true, solid: true, halo: true, holes: true })
    sortEntries([entry, other], camera)
    for (const part of [entry.holes, entry.halo, other.holes, other.halo]) assert.ok(part.renderOrder < 0)
    assert.deepEqual([other.outline.renderOrder, other.solid.renderOrder, entry.outline.renderOrder, entry.solid.renderOrder], [0, 1, 2, 3])
  })

  test("holes clip the halos of lines behind them, but not their own line's", () => {
    const near = entryAt(5, "near", { halo: true, holes: true })
    const far = entryAt(50, "far", { halo: true, holes: true })
    sortEntries([far, near], camera)
    const orders = [near.halo, near.holes, far.halo, far.holes].map(part => part.renderOrder)
    assert.deepEqual(orders, orders.toSorted((a, b) => a - b))
    assert.equal(new Set(orders).size, 4)
  })

  test("every halo in a split line goes under that line's holes", () => {
    const first = entryAt(5, "split", { halo: true, holes: true })
    const second = entryAt(6, "split", { halo: true })
    sortEntries([first, second], camera)
    assert.ok(first.halo.renderOrder < first.holes.renderOrder)
    assert.ok(second.halo.renderOrder < first.holes.renderOrder)
  })

  test("missing parts do not leave gaps in the order", () => {
    const bare = entryAt(50, "a", { solid: true })
    const full = entryAt(5, "b")
    sortEntries([bare, full], camera)
    assert.deepEqual([bare.solid.renderOrder, full.outline.renderOrder, full.solid.renderOrder], [0, 1, 2])
  })
})

describe("titleFraming with an empty top line", () => {
  const built = builtOf([0, 0, 0], [2, 1, 1])

  test("anchors on the lines that have geometry", () => {
    const bottom = { type: "bottom", built, transform: transform() }
    const framed = titleFraming([{ type: "top", built: null, transform: transform() }, bottom])
    assert.notEqual(framed, null)
    assert.deepEqual(framed.anchor, titleFraming([bottom]).anchor)
  })

  test("a top line with no triangles does not take the anchor", () => {
    const bottom = { type: "bottom", built, transform: transform() }
    const empty = { line: built.line, body: { triangles: 0, positions: new Float32Array() } }
    assert.notEqual(titleFraming([{ type: "top", built: empty, transform: transform() }, bottom]), null)
  })

  test("a top line with geometry keeps the anchor", () => {
    const top = { type: "top", built, transform: transform() }
    const framed = titleFraming([top, { type: "bottom", built: builtOf([0, -9, 0], [9, 0, 1]), transform: transform() }])
    assert.deepEqual(framed.anchor, titleFraming([top]).anchor)
  })
})

describe("pickEntry", () => {
  const raycaster = new THREE.Raycaster()
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 1000)
  camera.position.set(0, 0, 500)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()

  function block(x, z, width, order, side = THREE.FrontSide) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 40, 10), new THREE.MeshBasicMaterial({ side }))
    mesh.position.set(x, 0, z)
    mesh.renderOrder = order
    mesh.updateMatrixWorld(true)
    return mesh
  }

  function at(x, y = 0) {
    raycaster.setFromCamera(new THREE.Vector2(x / 100, y / 100), camera)
    return raycaster
  }

  test("finds the word under the point, and nothing off the text", () => {
    const entries = new Map([[1, { solid: block(-30, 0, 40, 1) }], [2, { solid: block(30, 0, 40, 2) }]])
    assert.equal(pickEntry(entries, at(-30)), 1)
    assert.equal(pickEntry(entries, at(30)), 2)
    assert.equal(pickEntry(entries, at(0)), null)
    assert.equal(pickEntry(entries, at(30, 60)), null)
  })

  test("the nearest solid wins whatever order they are in", () => {
    const entries = new Map([[1, { solid: block(0, 50, 40, 1) }], [2, { solid: block(0, 0, 40, 2) }]])
    assert.equal(pickEntry(entries, at(0)), 1)
    assert.equal(pickEntry(new Map(Array.from(entries).toReversed()), at(0)), 1)
  })

  test("the outline counts as part of the text", () => {
    const entries = new Map([[1, { solid: block(0, 0, 40, 2), outline: block(0, 0, 60, 1, THREE.BackSide) }]])
    assert.equal(pickEntry(entries, at(25)), 1)
  })

  test("an outline drawn over a further solid is what you see", () => {
    const entries = new Map([[1, { solid: block(0, 0, 40, 1) }], [2, { outline: block(0, 50, 60, 2, THREE.BackSide) }]])
    assert.equal(pickEntry(entries, at(0)), 2)
  })

  test("an outline behind a nearer solid is hidden", () => {
    const entries = new Map([[1, { solid: block(0, 50, 40, 1) }], [2, { outline: block(0, 0, 60, 2, THREE.BackSide) }]])
    assert.equal(pickEntry(entries, at(0)), 1)
    assert.equal(pickEntry(entries, at(25)), 2)
  })

  test("is nothing with nothing built", () => {
    assert.equal(pickEntry(new Map([[1, { solid: null, outline: null }]]), at(0)), null)
  })
})
