import * as THREE from "three"
import { clamp, round } from "./maths.js"
import { TRANSFORM_LIMITS } from "./settings.js"
import { view } from "./view.js"

const DIRECTION = new THREE.Vector3(0, -0.51007, 0.86013).normalize()
const TILT = radians(7.285)
const TITLE_REACH = 144

function radians(degrees) {
  return degrees * Math.PI / 180
}

function mesh(buffers, material) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3))
  geometry.setAttribute("uv", new THREE.BufferAttribute(buffers.uvs, 2))
  return new THREE.Mesh(geometry, material)
}

function discard(entry, part) {
  if (!entry[part]) return
  entry[part].geometry.dispose()
  entry.group.remove(entry[part])
  entry[part] = null
}

function clear(entry) {
  discard(entry, "halo")
  discard(entry, "outline")
  discard(entry, "solid")
  discard(entry, "holes")
  entry.texture?.dispose()
  entry.texture = null
}

function fill(entry, built) {
  clear(entry)
  entry.built = built
  if (!built) return
  entry.texture = new THREE.CanvasTexture(built.texture)
  entry.texture.magFilter = THREE.NearestFilter
  entry.texture.minFilter = THREE.NearestFilter
  entry.texture.generateMipmaps = false
  entry.texture.colorSpace = THREE.SRGBColorSpace
  entry.texture.userData.labels = built.labels
  entry.body.map = entry.texture
  entry.body.needsUpdate = true
  entry.border.map = entry.texture
  entry.border.needsUpdate = true
  entry.solid = built.body.triangles ? mesh(built.body, entry.body) : null
  if (entry.solid) entry.group.add(entry.solid)
}

function attachShell(entry, part, buffers, material) {
  discard(entry, part)
  entry[part] = buffers?.triangles ? mesh(buffers, material) : null
  if (entry[part]) entry.group.add(entry[part])
}

export function lineBounds(built) {
  return new THREE.Box3(new THREE.Vector3(...built.line.min), new THREE.Vector3(...built.line.max))
}

function anchorOf(value, bounds, centre) {
  const anchor = centre.clone()
  anchor.y = { bottom: bounds.min.y, top: bounds.max.y }[value.anchor.y] ?? centre.y
  anchor.z = { back: bounds.min.z, front: bounds.max.z }[value.anchor.z] ?? centre.z
  return anchor
}

export function placementMatrix(value, bounds) {
  const placement = new THREE.Matrix4().makeRotationX(radians(value.rotation))
  const base = placement.clone().multiply(new THREE.Matrix4().makeTranslation(...value.offset)).multiply(new THREE.Matrix4().makeScale(...value.type))
  const centre = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3()
  const anchor = bounds ? anchorOf(value, bounds, centre) : centre.clone()
  centre.applyMatrix4(base)
  anchor.applyMatrix4(base)
  const scale = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z).multiply(placement).multiply(new THREE.Matrix4().makeScale(...value.scale)).multiply(placement.clone().invert()).multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z))
  centre.applyMatrix4(scale)
  const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...value.rotate.map(radians)))
  const translate = new THREE.Vector3(...value.translate).applyMatrix4(rotation.clone().multiply(placement))
  return new THREE.Matrix4().makeTranslation(translate.x, translate.y, translate.z).multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z)).multiply(rotation).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z)).multiply(scale).multiply(base)
}

function wordParts(value, built) {
  const bounds = new THREE.Box3().setFromArray(built.body.positions)
  const centre = bounds.getCenter(new THREE.Vector3())
  const anchor = anchorOf(value, bounds, centre)
  const scale = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z).multiply(new THREE.Matrix4().makeScale(...value.word.scale)).multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z))
  return { scale, centre: centre.applyMatrix4(scale) }
}

function wordMatrix(value, built) {
  const word = value.word
  if (!word || !built?.body.triangles || word.scale.every(axis => axis === 1) && word.rotate.every(angle => !angle) && word.translate.every(axis => !axis)) return new THREE.Matrix4()
  const { scale, centre } = wordParts(value, built)
  const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...word.rotate.map(radians)))
  return new THREE.Matrix4().makeTranslation(...word.translate).multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z)).multiply(rotation).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z)).multiply(scale)
}

function objectMatrix(value, built) {
  return placementMatrix(value, built && lineBounds(built)).multiply(wordMatrix(value, built))
}

function wrap(degrees) {
  return degrees - 360 * Math.round(degrees / 360)
}

function orientation(rotate, rotation) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotate.map(radians))).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), radians(rotation)))
}

export function gizmoPose(value, bounds) {
  return {
    position: bounds.getCenter(new THREE.Vector3()).applyMatrix4(placementMatrix(value, bounds)),
    quaternion: orientation(value.rotate, value.rotation)
  }
}

function limited(translate) {
  return translate.map(axis => clamp(round(axis, 2), ...TRANSFORM_LIMITS.translation))
}

export function movedBy(value, offset) {
  const turn = orientation(value.rotate, value.rotation)
  const local = offset.clone().applyQuaternion(turn.clone().invert())
  const translate = limited(value.translate.map((axis, index) => axis + local.getComponent(index)))
  return { translate, offset: new THREE.Vector3(...translate).sub(new THREE.Vector3(...value.translate)).applyQuaternion(turn) }
}

function nearestAngles(quaternion, previous) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion)
  const first = [euler.x, euler.y, euler.z].map(angle => angle * 180 / Math.PI)
  const second = [first[0] + 180, 180 - first[1], first[2] + 180].map(wrap)
  const distance = angles => angles.reduce((sum, angle, index) => sum + Math.abs(wrap(angle - previous[index])), 0)
  return (distance(first) <= distance(second) ? first : second).map(angle => round(angle, 2))
}

export function wordPose(value, built, turned) {
  const quaternion = orientation(value.rotate, value.rotation)
  if (turned) quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...value.word.rotate.map(radians))))
  return { position: wordParts(value, built).centre.add(new THREE.Vector3(...value.word.translate)).applyMatrix4(placementMatrix(value, lineBounds(built))), quaternion }
}

export function wordMovedBy(value, built, offset) {
  const matrix = placementMatrix(value, lineBounds(built))
  const local = offset.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix).invert())
  const translate = limited(value.word.translate.map((axis, index) => axis + local.getComponent(index)))
  return { translate, position: wordParts(value, built).centre.add(new THREE.Vector3(...translate)).applyMatrix4(matrix) }
}

export function wordRotatedTo(value, quaternion) {
  return nearestAngles(orientation(value.rotate, value.rotation).invert().multiply(quaternion), value.word.rotate)
}

export function rotatedTo(value, quaternion) {
  const placement = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), radians(value.rotation))
  const rotate = nearestAngles(quaternion.clone().multiply(placement.invert()), value.rotate)
  const world = new THREE.Vector3(...value.translate).applyQuaternion(orientation(value.rotate, value.rotation))
  const translate = limited(world.applyQuaternion(orientation(rotate, value.rotation).invert()).toArray())
  return { rotate, translate }
}

function localBounds(item, grow) {
  const body = new THREE.Box3().setFromArray(item.built.body.positions)
  const bounds = body.clone()
  const shell = item.halo?.triangles ? item.halo : item.outline
  if (shell?.triangles) {
    const outline = new THREE.Box3().setFromArray(shell.positions)
    const scale = new THREE.Vector3(...shell.scale)
    const factor = new THREE.Vector3(...grow)
    outline.min.divide(scale)
    outline.max.divide(scale)
    bounds.union(new THREE.Box3(body.min.clone().sub(body.min.clone().sub(outline.min).multiply(factor)), body.max.clone().add(outline.max.clone().sub(body.max).multiply(factor))))
  }
  return bounds
}

function placedCorners(item, transform) {
  const matrix = objectMatrix(transform, item.built)
  return cornersOf(localBounds(item, [1, 1, 1])).map(corner => corner.applyMatrix4(matrix))
}

function restBounds(item) {
  const bounds = localBounds(item, item.transform.outlineGrow)
  return bounds.applyMatrix4(placementMatrix({ ...item.transform, scale: [1, 1, 1], rotate: [0, 0, 0], translate: [0, 0, 0] }, lineBounds(item.built)))
}

export function titleFraming(items) {
  const box = new THREE.Box3()
  const anchor = new THREE.Box3()
  const anchored = items.some(item => item.type === "top")
  let corners = []
  for (const item of items) {
    if (!item.built?.body.triangles || !item.transform) continue
    const placed = placedCorners(item, item.transform)
    for (const corner of placed) box.expandByPoint(corner)
    corners = corners.concat(placed)
    if (!anchored || item.type === "top") anchor.union(restBounds(item))
  }
  if (box.isEmpty() || anchor.isEmpty()) return null
  return { anchor, corners, size: box.getSize(new THREE.Vector3()).length(), reach: view.fixedDistance ? TITLE_REACH : null }
}

function place(entry, value) {
  if (entry.outline) entry.outline.scale.set(...entry.lines.scale.map(axis => 1 / axis))
  if (entry.halo) entry.halo.scale.set(...entry.rings.scale.map(axis => 1 / axis))
  if (entry.holes) entry.holes.scale.set(...entry.gaps.scale.map(axis => 1 / axis))
  entry.group.matrixAutoUpdate = false
  entry.base = placementMatrix(value, entry.built && lineBounds(entry.built))
  entry.group.matrix.copy(objectMatrix(value, entry.built))
  entry.group.updateMatrixWorld(true)
}

export function createEntry() {
  return {
    group: new THREE.Group(),
    outline: null,
    halo: null,
    solid: null,
    holes: null,
    body: new THREE.MeshBasicMaterial({ alphaTest: 0.5 }),
    border: new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false }),
    rim: new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false }),
    clip: new THREE.MeshBasicMaterial({ colorWrite: false }),
    built: null,
    base: new THREE.Matrix4(),
    lines: null,
    rings: null,
    gaps: null
  }
}

export function updateEntry(entry, item) {
  entry.line = item.line
  if (entry.built !== item.built) {
    fill(entry, item.built)
    entry.lines = null
    entry.rings = null
    entry.gaps = null
  }
  if (entry.gaps !== (item.holes ?? null)) {
    entry.gaps = item.holes ?? null
    attachShell(entry, "holes", entry.gaps, entry.clip)
  }
  if (entry.lines !== item.outline) {
    entry.lines = item.outline
    attachShell(entry, "outline", item.outline, entry.border)
  }
  if (entry.rings !== item.halo) {
    entry.rings = item.halo
    attachShell(entry, "halo", item.halo, entry.rim)
  }
  if (item.halo) entry.rim.color.set(item.haloColour)
  if (item.transform) place(entry, item.transform)
}

export function destroyEntry(entry) {
  clear(entry)
  entry.body.dispose()
  entry.border.dispose()
  entry.rim.dispose()
  entry.clip.dispose()
}

export function cornersOf(box) {
  const corners = []
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z))
    }
  }
  return corners
}

export function frameCamera(camera, { anchor, corners, size, fov, width, height, frame, maxScale = Infinity, reach }) {
  const target = anchor.getCenter(new THREE.Vector3())
  const aspect = width / height
  const orthographic = camera.isOrthographicCamera
  const right = new THREE.Vector3(0, 1, 0).cross(DIRECTION).normalize()
  let widest = 0
  let front = 0
  for (const corner of cornersOf(anchor)) {
    const offset = corner.clone().sub(target)
    widest = Math.max(widest, Math.abs(offset.dot(right)))
    front = Math.max(front, offset.dot(DIRECTION))
  }
  const clearance = reach ? Math.max(...corners.map(corner => corner.clone().sub(target).dot(DIRECTION))) + reach : 0
  const distance = orthographic ? size * 2 : Math.max((reach ?? widest) / Math.tan(fov * Math.PI / 360) + front, clearance)
  camera.position.copy(target).addScaledVector(DIRECTION, distance)
  camera.lookAt(target)
  if (!orthographic) camera.rotateX(TILT)
  camera.updateMatrixWorld(true)
  const inverse = camera.matrixWorld.clone().invert()
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let near = Infinity
  for (const corner of corners) {
    const local = corner.clone().applyMatrix4(inverse)
    const depth = -local.z
    const x = orthographic ? local.x : local.x / depth
    const y = orthographic ? local.y : local.y / depth
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    near = Math.min(near, depth)
  }
  const title = { left: 0, top: 0, width: maxX - minX, height: maxY - minY }
  const output = frame?.rect(title)
  const box = output ? frame.bounds(title) : title
  const fitted = Math.max(box.height / 2 / 0.94, box.width / 2 / aspect / 0.94, height / (2 * maxScale * (orthographic ? 1 : distance)))
  const span = output ? Math.max(fitted, height * devicePixelRatio / (2 * frame.pixels(title, output))) : fitted
  const centreX = minX + box.left + box.width / 2
  const centreY = maxY - box.top - box.height / 2
  if (orthographic) {
    Object.assign(camera, { left: centreX - span * aspect, right: centreX + span * aspect, top: centreY + span, bottom: centreY - span, near: distance / 100, far: distance * 100 })
  } else {
    camera.aspect = aspect
    camera.fov = Math.atan(span) * 360 / Math.PI
    camera.near = Math.max(near / 100, 0.01)
    camera.far = distance + size * 100
    camera.setViewOffset(width, height, centreX / (span * aspect) * width / 2, -centreY / span * height / 2, width, height)
  }
  camera.updateProjectionMatrix()
}

export function sortEntries(entries, camera) {
  const centre = new THREE.Vector3()
  const sorted = entries.map(entry => {
    new THREE.Box3().setFromObject(entry.group).getCenter(centre)
    return { entry, distance: centre.distanceToSquared(camera.position) }
  }).sort((a, b) => b.distance - a.distance)
  const lines = Array.from(Map.groupBy(sorted, item => item.entry.line).values()).map(words => ({ words, distance: words.reduce((sum, word) => sum + word.distance, 0) / words.length })).sort((a, b) => b.distance - a.distance)
  let order = 0
  for (const { words } of lines) {
    for (const { entry } of words) {
      if (entry.holes) entry.holes.renderOrder = -2
      if (entry.halo) entry.halo.renderOrder = -1
      if (entry.outline) entry.outline.renderOrder = order++
    }
    for (const { entry } of words) {
      if (entry.solid) entry.solid.renderOrder = order++
    }
  }
}
