import assert from "node:assert/strict"
import { describe, test } from "node:test"
import * as THREE from "three"
import { Gizmo, spreadAxes, worldPerPixel } from "../src/lib/gizmo.js"

const SIZE = 400

function setup(mode = "translate", rotation = 0, flat = false) {
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000)
  camera.position.copy(flat ? new THREE.Vector3(0, -0.51007, 0.86013).normalize().multiplyScalar(10) : new THREE.Vector3(4, 5, 10))
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const dom = Object.assign(new EventTarget(), { clientHeight: SIZE, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: SIZE, height: SIZE }) })
  const gizmo = new Gizmo(camera, dom)
  const object = new THREE.Object3D()
  object.rotation.z = rotation
  gizmo.flat = flat
  gizmo.setMode(mode)
  gizmo.attach(object)
  gizmo.update()
  const reach = worldPerPixel(camera, object.position, SIZE) * 96
  const placed = gizmo.helper.matrixWorld.clone()
  function at(point) {
    const projected = point.clone().applyMatrix4(placed).project(camera)
    return { clientX: (projected.x + 1) / 2 * SIZE, clientY: (1 - projected.y) / 2 * SIZE, pointerId: 1, button: 0, buttons: 1 }
  }
  function drag(from, to) {
    gizmo.down(at(from))
    gizmo.move(at(to))
    gizmo.up(at(to))
  }
  return { gizmo, object, at, drag, reach }
}

describe("gizmo", () => {
  test("keeps the same size on screen", () => {
    const camera = new THREE.PerspectiveCamera(40, 1)
    camera.position.set(0, 0, 10)
    camera.updateMatrixWorld()
    assert.ok(Math.abs(worldPerPixel(camera, new THREE.Vector3(), SIZE) - 2 * 10 * Math.tan(Math.PI / 9) / SIZE) < 1e-12)
  })

  test("picks the handle under the pointer", () => {
    const { gizmo, at } = setup()
    assert.equal(gizmo.pick(at(new THREE.Vector3(0.6, 0, 0))), "X")
    assert.equal(gizmo.pick(at(new THREE.Vector3(0, 0.6, 0))), "Y")
    assert.equal(gizmo.pick(at(new THREE.Vector3(0.32, 0.32, 0))), "XY")
    assert.equal(gizmo.pick({ clientX: 2, clientY: 2 }), null)
  })

  test("an arrow only moves along its axis", () => {
    const { object, drag, reach } = setup()
    drag(new THREE.Vector3(0.6, 0, 0), new THREE.Vector3(1.1, 0.3, 0.2))
    assert.ok(object.position.x > 0.3 * reach)
    assert.ok(Math.abs(object.position.y) < 1e-9 && Math.abs(object.position.z) < 1e-9)
  })

  test("a plane square moves across that plane", () => {
    const { object, drag, reach } = setup()
    drag(new THREE.Vector3(0.32, 0.32, 0), new THREE.Vector3(0.62, 0.12, 0))
    assert.ok(Math.abs(object.position.x - 0.3 * reach) < 1e-6)
    assert.ok(Math.abs(object.position.y + 0.2 * reach) < 1e-6)
    assert.ok(Math.abs(object.position.z) < 1e-9)
  })

  test("follows the object's own axes", () => {
    const { object, drag } = setup("translate", Math.PI / 2)
    drag(new THREE.Vector3(0.6, 0, 0), new THREE.Vector3(1, 0, 0))
    assert.ok(object.position.y > 0)
    assert.ok(Math.abs(object.position.x) < 1e-9)
  })

  function ringDrag(flat, distance) {
    const { gizmo, object, at } = setup("rotate", 0, flat)
    const point = angle => new THREE.Vector3(Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 0)
    const grab = at(point(Math.PI / 4))
    const ahead = at(point(Math.PI / 4 + 0.001))
    const behind = at(point(Math.PI / 4 - 0.001))
    const along = new THREE.Vector2(ahead.clientX - behind.clientX, ahead.clientY - behind.clientY)
    const speed = along.length() / 0.002
    along.normalize()
    const to = part => ({ ...grab, clientX: grab.clientX + along.x * speed * distance * part, clientY: grab.clientY + along.y * speed * distance * part })
    gizmo.down(grab)
    for (let step = 1; step <= 40; step++) gizmo.move(to(step / 40))
    gizmo.up(to(1))
    return new THREE.Euler().setFromQuaternion(object.quaternion)
  }

  function followRing(flat) {
    const { gizmo, object, at } = setup("rotate", 0, flat)
    const point = angle => at(new THREE.Vector3(Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 0))
    gizmo.down(point(Math.PI / 4))
    for (let step = 1; step <= 60; step++) gizmo.move(point(Math.PI / 4 + step / 60 * Math.PI * 1.5))
    gizmo.up(point(Math.PI * 7 / 4))
    return object.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * 1.5))
  }

  test("following a ring round keeps turning the whole way", () => {
    assert.ok(followRing(false) < 1e-3)
  })

  test("a scale handle stretches one axis", () => {
    const { object, drag } = setup("scale")
    drag(new THREE.Vector3(0.6, 0, 0), new THREE.Vector3(1.2, 0, 0))
    assert.ok(Math.abs(object.scale.x - 2) < 1e-6)
    assert.equal(object.scale.y, 1)
  })

  test("drag events bracket the change and the other handles fade", () => {
    const { gizmo, at } = setup()
    const events = []
    for (const type of ["start", "drag", "end"]) gizmo.addEventListener(type, () => events.push(type))
    gizmo.down(at(new THREE.Vector3(0.6, 0, 0)))
    const faded = gizmo.modes.translate.handles.filter(handle => handle.axis !== "X").every(handle => handle.material.opacity < 0.2)
    gizmo.move(at(new THREE.Vector3(0.8, 0, 0)))
    gizmo.up(at(new THREE.Vector3(0.8, 0, 0)))
    assert.ok(faded)
    assert.deepEqual(events, ["start", "drag", "end"])
    assert.equal(gizmo.dragging, false)
  })

  describe("in the fixed view", () => {
    test("moves an axis that hides behind another to its own direction", () => {
      const axes = [["X", 1, 0, 1], ["Y", 0, 1, 0.86], ["Z", 0, 1, 0.51]].map(([axis, x, y, length]) => ({ axis, direction: new THREE.Vector2(x, y), length }))
      const [x, y, z] = spreadAxes(axes)
      assert.equal(x.moved, false)
      assert.equal(y.moved, false)
      assert.equal(z.moved, true)
      assert.ok(z.direction.distanceTo(new THREE.Vector2(-Math.SQRT1_2, Math.SQRT1_2)) < 1e-9)
      assert.equal(z.length, 1)
    })

    test("treats axes pointing opposite ways on screen as overlapping", () => {
      const axes = [["X", 1, 0, 1], ["Y", 0, 1, 0.51], ["Z", 0, -1, 0.86]].map(([axis, x, y, length]) => ({ axis, direction: new THREE.Vector2(x, y), length }))
      const [, y, z] = spreadAxes(axes)
      assert.ok(y.moved !== z.moved)
    })

    function drawnNormal(gizmo, axis) {
      const mesh = gizmo.modes.rotate.handles.find(handle => handle.axis === axis).meshes[0]
      return new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, "XYZ".indexOf(axis)).normalize()
    }

    test("rings sit at their true angle, and only nearly edge-on ones are tipped open", () => {
      const { gizmo, object } = setup("rotate", 0, true)
      const toward = gizmo.camera.position.clone().normalize()
      const steps = 12
      let tipped = 0
      for (let x = 0; x < steps; x++) {
        for (let y = 0; y < steps; y++) {
          object.rotation.set(x / steps * Math.PI * 2, y / steps * Math.PI * 2, 0.3)
          object.updateMatrix()
          gizmo.update()
          for (const axis of ["X", "Y", "Z"]) {
            const truth = new THREE.Vector3(...[0, 1, 2].map(index => index === "XYZ".indexOf(axis) ? 1 : 0)).applyQuaternion(object.quaternion)
            const drawn = drawnNormal(gizmo, axis)
            if (Math.abs(truth.dot(toward)) >= 0.3) assert.ok(drawn.angleTo(truth) < 1e-6)
            else {
              tipped++
              assert.ok(Math.abs(Math.abs(drawn.dot(toward)) - 0.3) < 1e-6)
              assert.ok(Math.abs(drawn.dot(truth.clone().cross(toward).normalize())) < 1e-6)
            }
          }
        }
      }
      assert.ok(tipped > 0)
    })

    test("no plane square goes flat at any object angle", () => {
      const { gizmo, object } = setup("translate", 0, true)
      const steps = 12
      let thinnest = Infinity
      for (let x = 0; x < steps; x++) {
        for (let y = 0; y < steps; y++) {
          for (let z = 0; z < steps; z++) {
            object.rotation.set(x / steps * Math.PI * 2, y / steps * Math.PI * 2, z / steps * Math.PI * 2)
            object.updateMatrix()
            gizmo.update()
            const screen = gizmo.layout.map(entry => entry.direction.clone().multiplyScalar(entry.length))
            for (const [a, b] of [[1, 2], [2, 0], [0, 1]]) thinnest = Math.min(thinnest, Math.abs(screen[a].cross(screen[b])))
          }
        }
      }
      assert.ok(thinnest > 0.1, `thinnest ring was ${thinnest}`)
    })

    test("a depth arrow gets its own spot on screen", () => {
      const { gizmo, at } = setup("translate", 0, true)
      const tipY = at(new THREE.Vector3(0, 0.7, 0))
      const tipZ = at(new THREE.Vector3(0, 0, 0.7))
      assert.ok(Math.hypot(tipY.clientX - tipZ.clientX, tipY.clientY - tipZ.clientY) > 40)
      assert.equal(gizmo.pick(tipY), "Y")
      assert.equal(gizmo.pick(tipZ), "Z")
    })

    test("a stand-in arrow is not stretched and moves the title the way it points", () => {
      const { gizmo, object, at, drag } = setup("translate", 0, true)
      const centre = at(new THREE.Vector3())
      const tip = at(new THREE.Vector3(0, 0, 1.1))
      const length = Math.hypot(tip.clientX - centre.clientX, tip.clientY - centre.clientY)
      assert.ok(length > 96 * 0.9 && length < 96 * 1.3, `arrow was ${length}px`)
      const before = object.position.clone().project(gizmo.camera)
      drag(new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(0, 0, 1))
      const after = object.position.clone().project(gizmo.camera)
      const moved = new THREE.Vector2(after.x - before.x, before.y - after.y)
      assert.ok(moved.dot(new THREE.Vector2(tip.clientX - centre.clientX, tip.clientY - centre.clientY)) > 0)
    })

    test("dragging the depth arrow outward moves toward the camera only", () => {
      const { object, drag } = setup("translate", 0, true)
      drag(new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(0, 0, 1))
      assert.ok(object.position.z > 0)
      assert.ok(Math.abs(object.position.x) < 1e-9 && Math.abs(object.position.y) < 1e-9)
    })

    test("a true axis still follows the cursor", () => {
      const { object, drag, reach } = setup("translate", 0, true)
      drag(new THREE.Vector3(0.6, 0, 0), new THREE.Vector3(1, 0, 0))
      assert.ok(Math.abs(object.position.x - 0.4 * reach) < 0.01 * reach)
      assert.ok(Math.abs(object.position.y) < 1e-9 && Math.abs(object.position.z) < 1e-9)
    })

    test("a plane square moves across its two axes", () => {
      const { object, drag, reach } = setup("translate", 0, true)
      drag(new THREE.Vector3(0.32, 0.32, 0), new THREE.Vector3(0.52, 0.12, 0))
      assert.ok(Math.abs(object.position.x - 0.2 * reach) < 0.01 * reach)
      assert.ok(Math.abs(object.position.y + 0.2 * reach) < 0.01 * reach)
      assert.ok(Math.abs(object.position.z) < 1e-9)
    })

    test("following a ring round keeps turning the whole way", () => {
      assert.ok(followRing(true) < 0.1)
    })

    test("a straight drag along a ring keeps turning", () => {
      const near = ringDrag(true, 1)
      const far = ringDrag(true, 3)
      assert.ok(near.z > 0.6 && near.z < 1.1)
      assert.ok(far.z > near.z + 0.5)
      assert.ok(Math.abs(near.x) < 1e-9 && Math.abs(near.y) < 1e-9)
    })

    test("the ring being turned holds still", () => {
      const { gizmo, object, at } = setup("rotate", 0, true)
      const point = angle => new THREE.Vector3(Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 0)
      const before = drawnNormal(gizmo, "Z")
      gizmo.down(at(point(Math.PI / 4)))
      gizmo.move(at(point(Math.PI * 3 / 4)))
      gizmo.update()
      assert.ok(object.quaternion.angleTo(new THREE.Quaternion()) > 0.5)
      assert.ok(drawnNormal(gizmo, "Z").angleTo(before) < 1e-6)
    })

    test("scale handles stretch along their axis", () => {
      const { object, drag } = setup("scale", 0, true)
      drag(new THREE.Vector3(0, 0, 0.6), new THREE.Vector3(0, 0, 1.2))
      assert.ok(object.scale.z > 1.8 && object.scale.z < 2.3)
      assert.equal(object.scale.x, 1)
    })
  })
})
