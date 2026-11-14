import * as THREE from "three"

const COLOURS = { X: "#fd3043", Y: "#26ec45", Z: "#2d5ee8" }
const PLANES = { YZ: "X", XZ: "Y", XY: "Z" }
const AXES = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) }
const RADIUS = 96
const SHAFT = 0.014
const LIGHTEN = 0.45
const FADED = 0.15
const RING = 0.9
const MIN_SPEED = 0.35
const EDGE_ON = 0.35
const ROUND = 0.2
const MIN_OPEN = 0.3
const MOVED_DEPTH = 0.1
const POINTING = 0.05
const MIN_LENGTH = 0.35
const MIN_SPREAD = 35 * Math.PI / 180
const RING_SPAN = { X: ["Y", "Z"], Y: ["Z", "X"], Z: ["X", "Y"] }

function shaft(from, to, radius) {
  const geometry = new THREE.CylinderGeometry(radius, radius, to - from, 10)
  geometry.rotateZ(-Math.PI / 2)
  geometry.translate((from + to) / 2, 0, 0)
  return geometry
}

function cone(at, radius, length) {
  const geometry = new THREE.ConeGeometry(radius, length, 20)
  geometry.rotateZ(-Math.PI / 2)
  geometry.translate(at, 0, 0)
  return geometry
}

function cube(at, size) {
  const geometry = new THREE.BoxGeometry(size, size, size)
  geometry.translate(at, 0, 0)
  return geometry
}

function square(size, offset, plane) {
  const geometry = new THREE.PlaneGeometry(size, size)
  if (plane === "YZ") geometry.rotateY(-Math.PI / 2)
  if (plane === "XZ") geometry.rotateX(Math.PI / 2)
  geometry.translate(...[plane.includes("X") ? offset : 0, plane.includes("Y") ? offset : 0, plane.includes("Z") ? offset : 0])
  return geometry
}

function ring(radius, tube, radial, tubular) {
  return new THREE.TorusGeometry(radius, tube, radial, tubular)
}

function turned(geometry, axis) {
  if (axis === "Y") geometry.rotateZ(Math.PI / 2)
  if (axis === "Z") geometry.rotateY(-Math.PI / 2)
  return geometry
}

function ringFacing(geometry, axis) {
  if (axis === "X") geometry.rotateY(Math.PI / 2)
  if (axis === "Y") geometry.rotateX(Math.PI / 2)
  return geometry
}

function axisHandle(axis, mode) {
  if (mode === "rotate") return { visuals: [ringFacing(ring(RING, SHAFT, 8, 96), axis)], pickers: [ringFacing(ring(RING, 0.075, 6, 48), axis)] }
  const head = mode === "translate" ? cone(0.89, 0.065, 0.22) : cube(0.88, 0.11)
  return { visuals: [turned(shaft(0.14, 0.82, SHAFT), axis), turned(head, axis)], pickers: [turned(shaft(0.1, 1.02, 0.08), axis)] }
}

function handlesFor(mode) {
  const handles = Object.keys(AXES).map(axis => ({ axis, colour: COLOURS[axis], opacity: 1, ...axisHandle(axis, mode) }))
  if (mode === "translate") {
    for (const [plane, normal] of Object.entries(PLANES)) handles.push({ axis: plane, colour: COLOURS[normal], opacity: 0.35, visuals: [square(0.2, 0.32, plane)], pickers: [square(0.26, 0.32, plane)] })
  }
  return handles
}

export function worldPerPixel(camera, point, height) {
  const focal = camera.projectionMatrix.elements[5]
  if (camera.isOrthographicCamera) return 2 / (focal * height)
  return 2 * -point.clone().applyMatrix4(camera.matrixWorldInverse).z / (focal * height)
}

function apart(a, b) {
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b))))
}

function lineApart(a, b) {
  return Math.min(apart(a, b), Math.PI - apart(a, b))
}

export function spreadAxes(axes) {
  const result = axes.map(entry => ({ ...entry, direction: entry.direction.clone(), heading: entry.direction.clone(), reach: entry.length, moved: false }))
  for (let pass = 0; pass < axes.length; pass++) {
    const crowded = result.filter(entry => entry.length < MIN_LENGTH || result.some(other => other !== entry && lineApart(entry.direction, other.direction) < MIN_SPREAD))
    if (!crowded.length) break
    const worst = crowded.reduce((shortest, entry) => entry.length < shortest.length ? entry : shortest)
    const others = result.filter(entry => entry !== worst).map(entry => entry.direction)
    let best = null
    for (let step = 0; step < 24; step++) {
      const direction = new THREE.Vector2(Math.cos(step * Math.PI / 12), Math.sin(step * Math.PI / 12))
      if (worst.reach > POINTING && direction.dot(worst.heading) < -1e-9) continue
      const rays = others.map(other => apart(direction, other))
      const score = Math.min(...others.map(other => lineApart(direction, other))) + Math.min(...rays) / 2 + rays.reduce((sum, ray) => sum + ray, 0) / 20 + direction.dot(worst.heading) * 0.01
      if (!best || score > best.score) best = { direction, score }
    }
    Object.assign(worst, { direction: best.direction, length: 1, moved: true })
  }
  return result
}

export class Gizmo extends THREE.EventDispatcher {
  constructor(camera, dom) {
    super()
    this.camera = camera
    this.dom = dom
    this.flat = false
    this.object = null
    this.axis = null
    this.dragging = false
    this.helper = new THREE.Group()
    this.helper.visible = false
    this.helper.matrixAutoUpdate = false
    this.raycaster = new THREE.Raycaster()
    this.picker = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    this.modes = {}
    for (const mode of ["translate", "rotate", "scale"]) {
      const group = new THREE.Group()
      const handles = handlesFor(mode).map(handle => {
        const material = new THREE.MeshBasicMaterial({ color: handle.colour, transparent: true, opacity: handle.opacity, side: THREE.DoubleSide, toneMapped: false })
        const visuals = handle.visuals.map(geometry => new THREE.Mesh(geometry, material))
        const pickers = handle.pickers.map(geometry => Object.assign(new THREE.Mesh(geometry, this.picker), { userData: { axis: handle.axis } }))
        group.add(...visuals, ...pickers)
        return { ...handle, material, base: new THREE.Color(handle.colour), pickers, meshes: visuals.concat(pickers) }
      })
      this.modes[mode] = { group, handles, pickers: handles.flatMap(handle => handle.pickers) }
      this.helper.add(group)
    }
    this.guide = new THREE.Mesh(shaft(-60, 60, SHAFT / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, toneMapped: false }))
    this.guide.visible = false
    this.helper.add(this.guide)
    this.mode = null
    this.setMode("translate")
    this.down = this.down.bind(this)
    this.move = this.move.bind(this)
    this.up = this.up.bind(this)
    this.leave = this.leave.bind(this)
    dom.addEventListener("pointerdown", this.down)
    dom.addEventListener("pointermove", this.move)
    dom.addEventListener("pointerup", this.up)
    dom.addEventListener("pointercancel", this.up)
    dom.addEventListener("pointerleave", this.leave)
  }

  getHelper() {
    return this.helper
  }

  attach(object) {
    this.object = object
    this.helper.visible = true
    this.dispatchEvent({ type: "change" })
  }

  detach() {
    if (!this.object) return
    this.object = null
    this.helper.visible = false
    this.hover(null)
    this.dispatchEvent({ type: "change" })
  }

  setMode(mode) {
    if (this.mode === mode) return
    this.mode = mode
    for (const [name, { group }] of Object.entries(this.modes)) group.visible = name === mode
    this.hover(null)
    this.paint()
  }

  update() {
    if (!this.object) return
    this.camera.updateMatrixWorld()
    this.pixel = worldPerPixel(this.camera, this.object.position, this.dom.clientHeight || 1)
    this.size = this.pixel * RADIUS
    const basis = !this.flat || this.mode === "rotate" ? new THREE.Matrix4().makeRotationFromQuaternion(this.object.quaternion) : this.dragging ? this.start.basis : this.screenBasis()
    this.helper.matrix.copy(basis).scale(new THREE.Vector3(this.size, this.size, this.size)).setPosition(this.object.position)
    this.tiltRings()
    this.helper.updateMatrixWorld(true)
  }

  tiltRings() {
    const toward = this.viewDirection(this.object.position).negate()
    const inverse = this.object.quaternion.clone().invert()
    for (const handle of this.modes.rotate.handles) {
      const tilt = new THREE.Quaternion()
      const normal = AXES[handle.axis].clone().applyQuaternion(this.object.quaternion)
      const facing = normal.dot(toward)
      if (this.flat && Math.abs(facing) < MIN_OPEN) {
        const opened = normal.clone().addScaledVector(toward, -facing).normalize().multiplyScalar(Math.sqrt(1 - MIN_OPEN ** 2)).addScaledVector(toward, MIN_OPEN * (Math.sign(facing) || 1))
        tilt.copy(inverse).multiply(new THREE.Quaternion().setFromUnitVectors(normal, opened)).multiply(this.object.quaternion)
      }
      for (const mesh of handle.meshes) mesh.quaternion.copy(tilt)
    }
  }

  screenBasis() {
    const [right, up, back] = [0, 1, 2].map(column => new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, column))
    this.layout = spreadAxes(Object.keys(AXES).map(axis => {
      const world = AXES[axis].clone().applyQuaternion(this.object.quaternion)
      const flat = new THREE.Vector2(world.dot(right), world.dot(up))
      return { axis, world, depth: world.dot(back), length: flat.length(), direction: flat.lengthSq() > 1e-12 ? flat.normalize() : new THREE.Vector2(1, 0) }
    }))
    this.basis = new THREE.Matrix4().makeBasis(...this.layout.map(entry => right.clone().multiplyScalar(entry.direction.x * entry.length).addScaledVector(up, entry.direction.y * entry.length).addScaledVector(back, entry.moved ? (Math.sign(entry.depth) || 1) * MOVED_DEPTH : entry.depth)))
    return this.basis
  }

  screenPoint(event) {
    const box = this.dom.getBoundingClientRect()
    return new THREE.Vector2(event.clientX - box.left, box.top - event.clientY)
  }

  toScreen(point) {
    const box = this.dom.getBoundingClientRect()
    const projected = point.clone().project(this.camera)
    return new THREE.Vector2((projected.x + 1) / 2 * box.width, (projected.y - 1) / 2 * box.height)
  }

  ringGrab(axis) {
    const [j, k] = RING_SPAN[axis].map(name => "XYZ".indexOf(name))
    const placed = this.modes.rotate.handles.find(handle => handle.axis === axis).meshes[0].matrixWorld
    const local = this.hitPoint.clone().applyMatrix4(placed.clone().invert())
    const angle = Math.atan2(local.getComponent(k), local.getComponent(j))
    const onScreen = theta => this.toScreen(new THREE.Vector3().setComponent(j, Math.cos(theta) * RING).setComponent(k, Math.sin(theta) * RING).applyMatrix4(placed))
    const speed = onScreen(angle + 0.01).sub(onScreen(angle - 0.01)).divideScalar(0.02)
    const [first, second] = [j, k].map(index => new THREE.Vector3().setFromMatrixColumn(placed, index))
    const normal = first.cross(second).normalize()
    const drawn = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.object.position)
    const round = Math.abs(normal.dot(this.viewDirection(this.object.position))) > ROUND
    const inverse = placed.clone().invert()
    function onRing(ray) {
      const hit = ray.intersectPlane(drawn, new THREE.Vector3())
      if (!hit) return null
      hit.applyMatrix4(inverse)
      return new THREE.Vector2(hit.getComponent(j), hit.getComponent(k)).divideScalar(RING)
    }
    return { direction: speed.clone().normalize(), speed: Math.max(speed.length(), RADIUS * RING * MIN_SPEED), round, onRing, angle: 0, last: null }
  }

  pointer(event) {
    const box = this.dom.getBoundingClientRect()
    return new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, 1 - (event.clientY - box.top) / box.height * 2)
  }

  pick(event) {
    if (!this.object) return null
    this.update()
    this.raycaster.setFromCamera(this.pointer(event), this.camera)
    const hit = this.raycaster.intersectObjects(this.modes[this.mode].pickers, false)[0]
    this.hitPoint = hit?.point ?? null
    return hit?.object.userData.axis ?? null
  }

  axisVector(axis) {
    return AXES[axis].clone().applyQuaternion(this.start.quaternion)
  }

  viewDirection(point) {
    return this.camera.isOrthographicCamera ? this.camera.getWorldDirection(new THREE.Vector3()) : point.clone().sub(this.camera.position).normalize()
  }

  dragPlane(axis) {
    const centre = this.start.position
    const view = this.viewDirection(centre)
    let normal = view
    if (AXES[axis]) {
      const along = this.axisVector(axis)
      const across = along.clone().cross(view).cross(along)
      if (across.lengthSq() > 1e-8) normal = across.normalize()
    } else if (PLANES[axis]) normal = this.axisVector(PLANES[axis])
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centre)
  }

  hitPlane(event) {
    this.raycaster.setFromCamera(this.pointer(event), this.camera)
    return this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3())
  }

  down(event) {
    if (event.button !== 0 || !this.object || this.dragging) return
    const axis = this.pick(event)
    this.hover(axis)
    if (!axis) return
    this.start = { position: this.object.position.clone(), quaternion: this.object.quaternion.clone(), scale: this.object.scale.clone(), pixel: this.screenPoint(event), centre: this.toScreen(this.object.position), layout: this.layout, basis: this.basis, wpp: this.pixel }
    this.plane = null
    if (this.mode === "rotate") {
      this.start.ring = this.ringGrab(axis)
      this.raycaster.setFromCamera(this.pointer(event), this.camera)
      this.start.ring.last = this.start.ring.onRing(this.raycaster.ray)
      const along = this.axisVector(axis)
      if (!this.flat && Math.abs(along.dot(this.viewDirection(this.start.position))) > EDGE_ON) {
        this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(along, this.start.position)
        this.startPoint = this.hitPlane(event)
        if (!this.startPoint) return
        this.lastPoint = this.startPoint
      }
    } else if (!this.flat) {
      this.plane = this.dragPlane(axis)
      this.startPoint = this.hitPlane(event)
      if (!this.startPoint) return
    }
    this.dragging = true
    this.pointerId = event.pointerId
    this.dom.setPointerCapture?.(event.pointerId)
    this.showGuide(axis)
    this.paint()
    this.dispatchEvent({ type: "start" })
  }

  move(event) {
    if (!this.dragging) {
      if (!event.buttons) this.hover(this.pick(event))
      return
    }
    if (event.pointerId !== this.pointerId) return
    if (this.plane) {
      const point = this.hitPlane(event)
      if (!point) return
      if (this.mode === "translate") this.translate(point)
      else if (this.mode === "rotate") this.rotate(point)
      else this.resize(point)
    } else this.screenDrag(event)
    this.dispatchEvent({ type: "drag" })
    this.dispatchEvent({ type: "change" })
  }

  screenDrag(event) {
    const { layout, pixel, centre, wpp } = this.start
    const delta = this.screenPoint(event).sub(pixel)
    if (this.mode === "rotate") {
      const { ring } = this.start
      if (this.flat && ring.round) {
        this.raycaster.setFromCamera(this.pointer(event), this.camera)
        const now = ring.onRing(this.raycaster.ray)
        if (now && ring.last && ring.last.lengthSq() > 1e-4) ring.angle += now.clone().sub(ring.last).dot(new THREE.Vector2(-ring.last.y, ring.last.x).normalize())
        if (now) ring.last = now
      } else ring.angle = delta.dot(ring.direction) / ring.speed
      this.turnBy(ring.angle)
      return
    }
    const entry = axis => layout.find(item => item.axis === axis)
    const along = item => item.direction.clone().multiplyScalar(item.length / wpp)
    if (this.mode === "translate") {
      const [a, b] = Array.from(this.axis).map(entry)
      if (!b) {
        this.object.position.copy(this.start.position).addScaledVector(a.world, delta.dot(a.direction) * wpp / a.length)
        return
      }
      const [first, second] = [along(a), along(b)]
      const area = first.cross(second)
      this.object.position.copy(this.start.position).addScaledVector(a.world, delta.cross(second) / area).addScaledVector(b.world, first.cross(delta) / area)
      return
    }
    const item = entry(this.axis)
    const reach = pixel.clone().sub(centre).dot(item.direction)
    const index = "XYZ".indexOf(this.axis)
    this.object.scale.copy(this.start.scale).setComponent(index, this.start.scale.getComponent(index) * (Math.abs(reach) > 1 ? (reach + delta.dot(item.direction)) / reach : 1))
  }

  turnBy(angle) {
    this.object.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(this.axisVector(this.axis), angle).multiply(this.start.quaternion))
  }

  rotate(point) {
    const along = this.axisVector(this.axis)
    const from = this.lastPoint.clone().sub(this.start.position)
    const to = point.clone().sub(this.start.position)
    this.start.ring.angle += Math.atan2(from.clone().cross(to).dot(along), from.dot(to))
    this.lastPoint = point
    this.turnBy(this.start.ring.angle)
  }

  translate(point) {
    const delta = point.clone().sub(this.startPoint)
    if (AXES[this.axis]) {
      const along = this.axisVector(this.axis)
      delta.copy(along.multiplyScalar(delta.dot(along)))
    }
    this.object.position.copy(this.start.position).add(delta)
  }

  resize(point) {
    const along = this.axisVector(this.axis)
    const from = this.startPoint.clone().sub(this.start.position).dot(along)
    const to = point.clone().sub(this.start.position).dot(along)
    const index = "XYZ".indexOf(this.axis)
    this.object.scale.copy(this.start.scale).setComponent(index, this.start.scale.getComponent(index) * (Math.abs(from) > 1e-9 ? to / from : 1))
  }

  up(event) {
    if (!this.dragging || event.pointerId !== this.pointerId) return
    this.dragging = false
    this.dom.releasePointerCapture?.(event.pointerId)
    this.guide.visible = false
    this.paint()
    this.dispatchEvent({ type: "end" })
    this.dispatchEvent({ type: "change" })
  }

  leave() {
    if (!this.dragging) this.hover(null)
  }

  showGuide(axis) {
    this.guide.visible = this.mode !== "rotate" && !!AXES[axis]
    if (!this.guide.visible) return
    this.guide.rotation.set(0, axis === "Z" ? -Math.PI / 2 : 0, axis === "Y" ? Math.PI / 2 : 0)
    this.guide.material.color.set(COLOURS[axis])
  }

  hover(axis) {
    if (this.axis === axis) return
    this.axis = axis
    this.dom.style.cursor = axis ? "pointer" : ""
    this.paint()
    this.dispatchEvent({ type: "change" })
  }

  paint() {
    for (const handle of this.modes[this.mode].handles) {
      const active = handle.axis === this.axis
      handle.material.color.copy(handle.base)
      if (active) handle.material.color.lerp(new THREE.Color(1, 1, 1), LIGHTEN)
      handle.material.opacity = this.dragging && !active ? FADED : active ? 1 : handle.opacity
    }
  }

  dispose() {
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"]) this.dom.removeEventListener(type, { pointerdown: this.down, pointermove: this.move, pointerup: this.up, pointercancel: this.up, pointerleave: this.leave }[type])
    this.helper.traverse(child => {
      child.geometry?.dispose()
      child.material?.dispose()
    })
    this.picker.dispose()
  }
}
