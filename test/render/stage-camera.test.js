import { describe, test } from "node:test"
import assert from "node:assert/strict"
import * as THREE from "three"
import { close } from "../helpers/assert.js"
import { WIDE, builtOf, closeList, middle, moved, point, radians, transform } from "../helpers/stage.js"

globalThis.devicePixelRatio = 1

const { cornersOf, frameCamera, titleFraming } = await import("../../src/render/titleFraming.js")
const { UNZOOMED, keptPan, panMatrix, pannedBy, screenExtent, zoomedAt } = await import("../../src/render/pan.js")
const { ORBIT_FOV, orbitDollied, orbitPanned, orbitStart, orbitTurned, placeOrbit } = await import("../../src/render/orbit.js")
const { CAMERA_PRESETS, DEFAULT_CAMERA } = await import("../../src/lib/settings/camera.js")

const DIRECTION = new THREE.Vector3(0, -Math.sin(radians(DEFAULT_CAMERA.pitch)), Math.cos(radians(DEFAULT_CAMERA.pitch)))

function shellOf(min, max, scale = [1, 1, 1]) {
  return { triangles: 2, positions: new Float32Array(min.concat(max)), scale }
}

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

  test("frames the geometry, not the empty corners of its box", () => {
    const stepped = { line: flat.line, body: { triangles: 1, positions: new Float32Array([0, 0, 0, 10, 4, 0, 0, 0, 5, 10, 2, 5]) } }
    const { corners } = titleFraming([{ type: "top", built: stepped, transform: transform() }])
    assert.equal(corners.some(corner => corner.y > 3 && corner.z > 1), false)
  })

  test("frames a model by its opaque pixels, not its whole faces", () => {
    const runs = [{ corners: [[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0]] }]
    const { corners } = titleFraming([{ type: "top", built: { ...flat, runs }, transform: transform() }])
    assert.deepEqual(corners.map(corner => corner.toArray()), runs[0].corners)
  })

  test("frames every distinct vertex of each usable item", () => {
    const items = [{ type: "top", built: flat, transform: transform() }, { type: "bottom", built: null, transform: transform() }, { type: "bottom", built: flat, transform: transform() }]
    assert.equal(titleFraming(items).corners.length, 4)
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

  test("fitting the same title again scans each set of vertices once", () => {
    let scans = 0
    function counted(buffers) {
      const positions = buffers.positions
      return {
        ...buffers,
        get positions() {
          scans++
          return positions
        }
      }
    }
    const built = builtOf([0, 0, 0], [10, 10, 10])
    const item = { type: "top", built: { ...built, body: counted(built.body) }, outline: counted(shellOf([-2, -1, -1], [22, 11, 11], [2, 1, 1])), transform: transform({ outlineGrow: [2, 1, 3] }) }
    const first = titleFraming([item])
    const second = titleFraming([item])
    assert.equal(scans, 2)
    assert.deepEqual(second.anchor, first.anchor)
    assert.deepEqual(second.corners, first.corners)
  })

  test("reach is only set for a fixed distance", () => {
    const items = [{ type: "top", built: flat, transform: transform() }]
    assert.equal(titleFraming(items).reach, null)
    assert.equal(titleFraming(items, false).reach, null)
    assert.equal(titleFraming(items, true).reach, 144)
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

  test("perspective turns the camera by the tilt", () => {
    const target = anchor.getCenter(new THREE.Vector3())
    const camera = new THREE.PerspectiveCamera()
    frameCamera(camera, { anchor, corners, size, fov: 43, width: 800, height: 600 })
    const direction = camera.getWorldDirection(new THREE.Vector3())
    const towards = target.clone().sub(camera.position).normalize()
    close(direction.angleTo(towards), radians(7.285), 1e-6)
    assert.ok(direction.y > towards.y)
  })

  test("orthographic matches perspective as the field of view closes", () => {
    const target = anchor.getCenter(new THREE.Vector3())
    const camera = new THREE.OrthographicCamera()
    frameCamera(camera, { anchor, corners, size, width: 800, height: 600 })
    close(camera.getWorldDirection(new THREE.Vector3()).angleTo(target.clone().sub(camera.position).normalize()), 0, 1e-9)
    const narrow = new THREE.PerspectiveCamera()
    frameCamera(narrow, { anchor, corners, size, fov: 0.001, width: 800, height: 600 })
    function shape(camera) {
      const points = corners.map(corner => corner.clone().project(camera))
      const xs = points.map(item => item.x)
      const ys = points.map(item => item.y)
      return (Math.max(...ys) - Math.min(...ys)) / (Math.max(...xs) - Math.min(...xs))
    }
    close(shape(camera), shape(narrow), 1e-4)
  })

  test("yaw swings the camera round to the side", () => {
    const target = anchor.getCenter(new THREE.Vector3())
    const camera = new THREE.PerspectiveCamera()
    frameCamera(camera, { anchor, corners, size, angle: { ...DEFAULT_CAMERA, yaw: 30 }, width: 800, height: 600 })
    const offset = camera.position.clone().sub(target).normalize()
    close(Math.atan2(offset.x, offset.z), radians(30), 1e-9)
    close(Math.asin(-offset.y), radians(DEFAULT_CAMERA.pitch), 1e-9)
  })

  test("the front preset looks straight at the title", () => {
    const target = anchor.getCenter(new THREE.Vector3())
    const camera = new THREE.OrthographicCamera()
    frameCamera(camera, { anchor, corners, size, angle: CAMERA_PRESETS.find(preset => preset.value === "front").camera, width: 800, height: 600 })
    closeList(camera.position.clone().sub(target).normalize(), [0, 0, 1])
    closeList(camera.getWorldDirection(new THREE.Vector3()), [0, 0, -1])
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
    const lens = Math.cos(radians(DEFAULT_CAMERA.tilt))
    close(camera.top - camera.bottom, 300 * lens ** 2)
    close(camera.right - camera.left, 400 * lens)
  })

  test("maxScale holds the same size as the field of view closes", () => {
    const angle = { ...DEFAULT_CAMERA, tilt: 30 }
    function shown(camera) {
      frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, angle, fov: 0.001, width: 800, height: 600, maxScale: 2 })
      camera.updateMatrixWorld(true)
      const points = cornersOf(line).map(corner => corner.clone().project(camera))
      const xs = points.map(item => item.x)
      const ys = points.map(item => item.y)
      return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
    }
    closeList(shown(new THREE.OrthographicCamera()), shown(new THREE.PerspectiveCamera()), 1e-4)
  })

  test("a narrow field of view keeps the near plane close to the title", () => {
    const camera = new THREE.PerspectiveCamera()
    frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, fov: 0.1, width: 800, height: 600 })
    camera.updateMatrixWorld(true)
    const nearest = Math.min(...cornersOf(line).map(corner => -corner.clone().applyMatrix4(camera.matrixWorldInverse).z))
    close(camera.near, nearest - 20, 1e-6)
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
    close(seen[0].width, 20 / Math.cos(radians(DEFAULT_CAMERA.tilt)))
    assert.equal(seen[0].left, 0)
    assert.equal(seen[0].top, 0)
  })

  test("a frame stops the view going past one output pixel per device pixel", () => {
    const frame = { rect: title => title, bounds: title => title, pixels: () => 0.5 }
    const camera = new THREE.OrthographicCamera()
    globalThis.devicePixelRatio = 2
    try {
      frameCamera(camera, { anchor: line, corners: cornersOf(line), size: 20, fov: 43, width: 800, height: 600, frame })
    } finally {
      globalThis.devicePixelRatio = 1
    }
    close((camera.top - camera.bottom) / Math.cos(radians(DEFAULT_CAMERA.tilt)) ** 2, 2400)
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

  const square = { extent: { left: -0.94, right: 0.94, bottom: -0.94, top: 0.94 }, aspect: 1 }
  const wide = { extent: { left: -0.94, right: 0.94, bottom: -0.1, top: 0.1 }, aspect: 2 }

  function edges(pan, { extent }) {
    const [left, bottom] = shown(pan, extent.left, extent.bottom)
    const [right, top] = shown(pan, extent.right, extent.top)
    return { left, right, bottom, top }
  }

  function furthest(pan, view) {
    return [pannedBy(pan, 100, 100, view), pannedBy(pan, -100, -100, view)].map(moved => edges(moved, view))
  }

  test("zooming keeps the point under the cursor where it is", () => {
    const pan = zoomedAt(UNZOOMED, 2, 0.5, -0.25, square)
    assert.equal(pan.scale, 2)
    const point = shown(pan, 0.5, -0.25)
    assert.ok(Math.abs(point[0] - 0.5) < 1e-9 && Math.abs(point[1] + 0.25) < 1e-9)
  })

  test("zooming again still keeps the point under the cursor", () => {
    const first = zoomedAt(UNZOOMED, 2, 0.5, 0, square)
    const second = zoomedAt(first, 3, -0.2, 0.4, square)
    const before = new THREE.Vector3(-0.2, 0.4, 0).applyMatrix4(panMatrix(first).invert())
    const after = before.applyMatrix4(panMatrix(second))
    assert.ok(Math.abs(after.x + 0.2) < 1e-9 && Math.abs(after.y - 0.4) < 1e-9)
  })

  test("zoom stops at its limits", () => {
    assert.equal(zoomedAt(UNZOOMED, 1000, 0, 0, square).scale, 32)
    assert.equal(zoomedAt(UNZOOMED, 0.001, 0, 0, square).scale, 0.25)
  })

  test("a limited zoom does not move the view", () => {
    const pan = zoomedAt(zoomedAt(UNZOOMED, 32, 0.1, 0.1, square), 2, 0.5, 0.5, square)
    assert.deepEqual(pan, zoomedAt(UNZOOMED, 32, 0.1, 0.1, square))
  })

  test("panning moves the content the same way as the drag", () => {
    const pan = zoomedAt(UNZOOMED, 4, 0, 0, square)
    const [x, y] = shown(pannedBy(pan, 0.25, -0.5, square), 0, 0)
    assert.equal(x, 0.25)
    assert.equal(y, -0.5)
  })

  test("zoomed out, a small title pans until its edge reaches the side of the view", () => {
    const pan = zoomedAt(UNZOOMED, 0.25, 0, 0, wide)
    const [right, left] = furthest(pan, wide)
    close(right.right, 1 + 0.05 * 0.235)
    close(left.left, -1 - 0.05 * 0.235)
    close(right.top, 1 + 0.1 * 0.025)
    close(left.bottom, -1 - 0.1 * 0.025)
  })

  test("a title that fills the view still has a little room to move", () => {
    const [right, left] = furthest(UNZOOMED, square)
    close(right.right, 1.094)
    close(left.left, -1.094)
  })

  test("zoomed in, every edge of the title can be reached but never pulled off screen", () => {
    for (const scale of [2, 8, 32]) {
      const pan = zoomedAt(UNZOOMED, scale, 0, 0, wide)
      const [right, left] = furthest(pan, wide)
      close(right.left, -1 + 0.05)
      close(left.right, 1 - 0.05)
      assert.ok(right.right > 1 && left.left < -1)
      if (scale > 10) {
        close(right.bottom, -1 + 0.1)
        close(left.top, 1 - 0.1)
      } else {
        close(right.top, 1 + 0.1 * 0.1 * scale)
        close(left.bottom, -1 - 0.1 * 0.1 * scale)
      }
    }
  })

  test("the room past the edges grows with the title until it fills the view, then stays the same on screen", () => {
    for (const scale of [0.25, 0.5, 1, 2, 4, 16, 32]) {
      const pan = zoomedAt(UNZOOMED, scale, 0, 0, square)
      const [right, left] = furthest(pan, square)
      close(right.left - left.left, Math.abs(2 - 1.88 * scale) + 0.2 * Math.min(1, 0.94 * scale))
    }
  })

  test("zooming after panning moves the title smoothly and keeps it on screen", () => {
    let pan = pannedBy(zoomedAt(UNZOOMED, 8, 0, 0, wide), -100, 0, wide)
    function seen(pan) {
      const { left, right } = edges(pan, wide)
      return { left: Math.max(left, -1), right: Math.min(right, 1) }
    }
    let last = seen(pan)
    for (const factor of Array(400).fill(0.99).concat(Array(400).fill(1.01))) {
      pan = zoomedAt(pan, factor, 0, 0, wide)
      const now = seen(pan)
      assert.ok(Math.abs(now.right - last.right) < 0.05 && Math.abs(now.left - last.left) < 0.05)
      assert.ok(now.right > -1 && now.left < 1)
      last = now
    }
  })

  test("a view left outside the limits is pulled back in", () => {
    const pan = keptPan({ scale: 1, x: 5, y: -5 }, wide)
    close(pan.x, 0.107)
    close(pan.y, -0.91)
  })

  test("the extent is where the title lands on screen at any field of view and tilt", () => {
    const corners = cornersOf(WIDE)
    for (const camera of [new THREE.OrthographicCamera(), new THREE.PerspectiveCamera()]) {
      for (const tilt of [0, 12, -30]) {
        frameCamera(camera, { anchor: WIDE, corners, size: 70, angle: { ...DEFAULT_CAMERA, tilt }, fov: 30, width: 900, height: 600 })
        const extent = screenExtent(corners, new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
        const projected = corners.map(corner => corner.clone().project(camera))
        close(extent.left, Math.min(...projected.map(corner => corner.x)))
        close(extent.right, Math.max(...projected.map(corner => corner.x)))
        close(extent.bottom, Math.min(...projected.map(corner => corner.y)))
        close(extent.top, Math.max(...projected.map(corner => corner.y)))
        close(Math.max(extent.right - extent.left, (extent.top - extent.bottom) * 1.5), 1.88)
      }
    }
  })

  test("points behind the camera do not count towards the extent", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 100)
    camera.updateMatrixWorld(true)
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const extent = screenExtent([point(-1, 0, -10), point(1, 0, -10), point(50, 50, 10)], matrix)
    close(extent.left, -extent.right)
    assert.ok(extent.right < 1)
    assert.equal(screenExtent([point(0, 0, 10)], matrix), null)
  })

  test("the matrix leaves depth alone and scales from the middle of the screen", () => {
    const point = new THREE.Vector4(0.5, 0.5, 0.25, 2).applyMatrix4(panMatrix({ scale: 2, x: 0.1, y: 0 }))
    assert.deepEqual(point.toArray(), [1.2, 1, 0.25, 2])
  })
})

describe("orbiting", () => {
  const corners = cornersOf(new THREE.Box3(new THREE.Vector3(-100, -20, -10), new THREE.Vector3(100, 20, 10)))
  const centre = new THREE.Vector3()
  const lens = { fov: 40, aspect: 2, size: 205 }

  function started() {
    return orbitStart(new THREE.Vector3(0, -50, 200), centre, corners, lens.fov, lens.aspect)
  }

  function placed(orbit, camera = new THREE.PerspectiveCamera()) {
    placeOrbit(camera, orbit, lens)
    return camera
  }

  function clip(camera, point) {
    return point.clone().project(camera)
  }

  test("starts from the framed camera's direction", () => {
    const camera = placed(started())
    const direction = camera.position.clone().normalize()
    assert.ok(direction.distanceTo(new THREE.Vector3(0, -50, 200).normalize()) < 1e-9)
  })

  test("starts with the whole title in view and the target in the middle", () => {
    const camera = placed(started())
    const points = corners.map(corner => clip(camera, corner))
    assert.ok(points.every(point => Math.abs(point.x) <= 0.94 + 1e-9 && Math.abs(point.y) <= 0.94 + 1e-9))
    assert.ok(points.some(point => Math.abs(point.x) > 0.93 || Math.abs(point.y) > 0.93))
    const middle = clip(camera, centre)
    assert.ok(Math.abs(middle.x) < 1e-9 && Math.abs(middle.y) < 1e-9)
  })

  test("uses the field of view setting with no lens shift", () => {
    const camera = new THREE.PerspectiveCamera()
    camera.setViewOffset(100, 100, 30, 0, 100, 100)
    placed(started(), camera)
    assert.equal(camera.fov, 40)
    assert.equal(camera.view?.enabled ?? false, false)
  })

  test("turning keeps the target centred and the distance the same", () => {
    const orbit = orbitTurned(started(), 0.7, 0.4)
    const camera = placed(orbit)
    assert.ok(Math.abs(camera.position.length() - orbit.distance) < 1e-9)
    const middle = clip(camera, centre)
    assert.ok(Math.abs(middle.x) < 1e-9 && Math.abs(middle.y) < 1e-9)
  })

  test("dragging right swings the camera left", () => {
    assert.ok(placed(orbitTurned(started(), 0.5, 0)).position.x < 0)
  })

  test("dragging down lifts the camera", () => {
    assert.ok(placed(orbitTurned(started(), 0, 0.3)).position.y > placed(started()).position.y)
  })

  test("stops short of straight up and straight down", () => {
    assert.ok(orbitTurned(started(), 0, 100).pitch < Math.PI / 2)
    assert.ok(orbitTurned(started(), 0, -100).pitch > -Math.PI / 2)
  })

  test("zooming moves the camera toward the target, within limits", () => {
    const orbit = started()
    const closer = orbitDollied(orbit, 2)
    assert.ok(Math.abs(closer.distance - orbit.distance / 2) < 1e-9)
    assert.equal(placed(closer).fov, 40)
    assert.equal(orbitDollied(orbit, 1e9).distance, orbit.home * 0.05)
    assert.equal(orbitDollied(orbit, 1e-9).distance, orbit.home * 20)
  })

  test("panning moves the target with the cursor", () => {
    const orbit = started()
    const camera = placed(orbit)
    const moved = orbitPanned(orbit, camera, 0.2, -0.1, lens)
    const after = clip(placed(moved), centre)
    assert.ok(Math.abs(after.x - 0.2) < 1e-9 && Math.abs(after.y + 0.1) < 1e-9)
  })

  test("an orthographic camera orbits with the same framing", () => {
    const orbit = started()
    const camera = placed(orbit, new THREE.OrthographicCamera())
    const span = orbit.distance * Math.tan(ORBIT_FOV * Math.PI / 360)
    assert.ok(Math.abs(camera.top - span) < 1e-9)
    assert.ok(Math.abs(camera.right - span * lens.aspect) < 1e-9)
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
