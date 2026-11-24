import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { quietStorage } from "../helpers/browser.js"
import { BOUNDS, WIDE, builtOf, closeList, middle, moved, point, radians, transform } from "../helpers/stage.js"

quietStorage()
globalThis.devicePixelRatio = 1

const { pickEntry, sortEntries } = await import("../../src/render/stage.js")
const { gizmoPose, lineBounds, movedBy, objectMatrix, placementMatrix, rotatedTo, wordMovedBy, wordPose, wordRotatedTo } = await import("../../src/render/placement.js")
const { titleFraming } = await import("../../src/render/titleFraming.js")

function tilted(overrides) {
  return transform({ rotation: 90, type: [0.78042, 1.67665, 0.77035], offset: [0, -40, -2], anchor: { y: "top", z: "front" }, scale: [1.5, 0.8, 1.2], rotate: [20, -35, 10], translate: [5, -3, 8], ...overrides })
}

function turning(x, y, z, rotation = 0) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(radians(x), radians(y), radians(z))).multiply(new THREE.Quaternion().setFromAxisAngle(point(1, 0, 0), radians(rotation)))
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

describe("a turned word on an unevenly scaled line", () => {
  const built = builtOf([-10, 0, 0], [10, 20, 10], [-30, 0, 0], [30, 20, 10])

  test("stays square and turns the way the gizmo shows", () => {
    const value = tilted({ word: { scale: [1.5, 0.5, 2], rotate: [15, 25, -40], translate: [3, -2, 6] } })
    const matrix = objectMatrix(value, built)
    const columns = [0, 1, 2].map(axis => new THREE.Vector3().setFromMatrixColumn(matrix, axis))
    for (const [axis, column] of columns.entries()) {
      const length = value.type[axis] * value.scale[axis] * value.word.scale[axis]
      const direction = new THREE.Vector3().setComponent(axis, 1).applyQuaternion(wordPose(value, built, true).quaternion)
      closeList(column, direction.multiplyScalar(length).toArray(), 1e-6)
    }
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

describe("pickEntry", () => {
  const SHOWN = { visible: true }
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
    const entries = new Map([[1, { group: SHOWN, solid: block(-30, 0, 40, 1) }], [2, { group: SHOWN, solid: block(30, 0, 40, 2) }]])
    assert.equal(pickEntry(entries, at(-30)), 1)
    assert.equal(pickEntry(entries, at(30)), 2)
    assert.equal(pickEntry(entries, at(0)), null)
    assert.equal(pickEntry(entries, at(30, 60)), null)
  })

  test("the nearest solid wins whatever order they are in", () => {
    const entries = new Map([[1, { group: SHOWN, solid: block(0, 50, 40, 1) }], [2, { group: SHOWN, solid: block(0, 0, 40, 2) }]])
    assert.equal(pickEntry(entries, at(0)), 1)
    assert.equal(pickEntry(new Map(Array.from(entries).toReversed()), at(0)), 1)
  })

  test("the outline counts as part of the text", () => {
    const entries = new Map([[1, { group: SHOWN, solid: block(0, 0, 40, 2), outline: block(0, 0, 60, 1, THREE.BackSide) }]])
    assert.equal(pickEntry(entries, at(25)), 1)
  })

  test("an outline drawn over a further solid is what you see", () => {
    const entries = new Map([[1, { group: SHOWN, solid: block(0, 0, 40, 1) }], [2, { group: SHOWN, outline: block(0, 50, 60, 2, THREE.BackSide) }]])
    assert.equal(pickEntry(entries, at(0)), 2)
  })

  test("an outline behind a nearer solid is hidden", () => {
    const entries = new Map([[1, { group: SHOWN, solid: block(0, 50, 40, 1) }], [2, { group: SHOWN, outline: block(0, 0, 60, 2, THREE.BackSide) }]])
    assert.equal(pickEntry(entries, at(0)), 1)
    assert.equal(pickEntry(entries, at(25)), 2)
  })

  test("a hidden word is not picked, and does not block the one behind it", () => {
    const entries = new Map([[1, { group: { visible: false }, solid: block(0, 50, 40, 1) }], [2, { group: SHOWN, solid: block(0, 0, 40, 2) }]])
    assert.equal(pickEntry(entries, at(0)), 2)
    assert.equal(pickEntry(new Map([[1, { group: { visible: false }, solid: block(0, 0, 40, 1) }]]), at(0)), null)
  })

  test("is nothing with nothing built", () => {
    assert.equal(pickEntry(new Map([[1, { group: SHOWN, solid: null, outline: null }]]), at(0)), null)
  })
})
