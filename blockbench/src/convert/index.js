import * as THREE from "three"
import { effectScope, watch } from "vue"
import { buildPartOutline, turned } from "../../../src/lib/geometry/build.js"
import { CREEPER, TERMINATOR_CLOSE, TERMINATOR_OPEN, baseChar } from "../../../src/lib/font/order.js"
import { RENDER_ORDER, SHARE } from "../passes.js"
import { sendStats } from "../stats.js"
import { memberOf, runtimeOf } from "../titles.js"
import { allSides, hullOf, makeCube, sharedTurn, swatchPaint, texturedPaint, wholeSides } from "./cubes.js"
import { makeMesh } from "./mesh.js"
import { boxesOf, facesOf, solidBox, solidPoints } from "./quads.js"

const FACING = new THREE.Matrix4().makeRotationY(Math.PI)
const STILL = new THREE.Quaternion()
const OUTLINE_ORDER = -1

const round = value => Math.roundTo(value, 4)

export function isCubes(element) {
  const { item } = memberOf(element) ?? {}
  return !!item?.built && !item.built.body.sizes && !item.built.shapes
}

function isReady(element) {
  const state = runtimeOf(element)
  return !!state.error || state.settled && state.sharp !== false && !state.built?.shader
}

function whenReady(element) {
  if (isReady(element)) return Promise.resolve()
  const scope = effectScope(true)
  return new Promise(resolve => scope.run(() => watch(() => isReady(element), ready => ready && resolve()))).finally(() => scope.stop())
}

function frameOf(element) {
  const { entry, pivot } = memberOf(element)
  const turn = new THREE.Quaternion()
  const size = new THREE.Vector3()
  entry.group.matrix.decompose(new THREE.Vector3(), turn, size)
  const base = new THREE.Quaternion().setFromRotationMatrix(FACING).invert().premultiply(turn)
  const matrix = new THREE.Matrix4().makeRotationFromQuaternion(base.clone().invert()).multiply(entry.group.matrix)
  const own = new THREE.Quaternion().setFromEuler(new THREE.Euler(...element.rotation.map(Math.degToRad), Format.euler_order))
  return { base, matrix, size, origin: new THREE.Vector3(...element.position).add(pivot), rotation: own.multiply(base) }
}

function angles(quaternion) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, Format.euler_order)
  return [euler.x, euler.y, euler.z].map(angle => round(Math.radToDeg(angle)))
}

function makeTextures(name, pages, made) {
  return pages.map(page => {
    const url = page.toDataURL()
    const existing = Texture.all.find(texture => texture.source === url)
    if (existing) return existing
    const texture = new Texture({ name: `${name}.png`, render_sides: "front", uv_width: page.width, uv_height: page.height }).fromDataURL(url).add(false)
    texture.uv_width = page.width
    texture.uv_height = page.height
    made.push(texture)
    return texture
  })
}

function outlineMatrix(outline, matrix) {
  return matrix.clone().multiply(new THREE.Matrix4().makeScale(...outline.scale.map(axis => 1 / axis)))
}

function newGroup(name, origin, parent, made, rotation = [0, 0, 0]) {
  const group = new Group({ name, origin: origin.toArray().map(round), rotation, isOpen: false })
  if (parent instanceof Group) group.addTo(parent)
  else group.sortInBefore(parent)
  group.init()
  made.push(group)
  return group
}

function newLine(name, origin, element, made, rotation) {
  const group = newGroup(name, origin, element, made, rotation)
  group[SHARE] = true
  return group
}

function newOutline(origin, parent, made) {
  const group = newGroup("outline", origin, parent, made)
  group[RENDER_ORDER] = OUTLINE_ORDER
  return group
}

function nameOf(char) {
  return { [TERMINATOR_OPEN]: "open_terminator", [TERMINATOR_CLOSE]: "close_terminator", [CREEPER]: "creeper" }[char] ?? (char.trim() || "space")
}

function placed(matrix, turn, scale) {
  return point => new THREE.Vector3(...(turn ? turned(point, turn, scale) : point)).applyMatrix4(matrix)
}

function boxesIn(faces, turn, matrix) {
  if (!faces[0].solid) return boxesOf(faces)
  return Array.from(Map.groupBy(faces, face => face.solid)).flatMap(([solid, quads]) => {
    const box = solidBox(solidPoints(solid, placed(matrix, turn)), [])
    const { members, extras } = wholeSides(box, quads)
    return [{ ...box, members }].concat(boxesOf(extras))
  })
}

function outlineBoxes(built, part, outline, matrix) {
  const place = outlineMatrix(outline, matrix)
  return buildPartOutline(built, part, outline.scale).solids.map(solid => {
    const box = solidBox(solidPoints(solid, placed(place, solid.turn, outline.scale)), [])
    return { ...box, members: allSides(box) }
  })
}

function buildCubes(element, frame, name, made) {
  const { item } = memberOf(element)
  const { built, outline } = item
  const { matrix, size, origin, rotation } = frame
  const pages = built.pages.map(page => page.texture)
  const textures = makeTextures(name, pages, made.textures)
  const faces = facesOf(built.body, matrix, pages)
  const line = newLine(name, origin, element, made.groups, angles(rotation))
  const paint = texturedPaint(textures)
  const letters = []
  const parts = built.parts?.()

  function add(cube, group) {
    cube.visibility = element.visibility
    cube.addTo(group).init()
    made.elements.push(cube)
  }

  for (const [glyph, members] of Map.groupBy(faces, face => face.glyph)) {
    const boxes = boxesIn(members, parts?.[glyph].turn, matrix)
    const char = baseChar(built.chars?.[glyph] ?? "")
    const turn = sharedTurn(boxes)
    const middle = new THREE.Box3().setFromPoints(members.flatMap(face => face.points)).getCenter(new THREE.Vector3())
    const own = built.chars?.length > 1
    const turned = own && turn
    const space = { centre: turned ? middle : new THREE.Vector3(), turn: turned ? turn : STILL, origin, pivot: own ? middle.clone().add(origin) : origin }
    const group = own ? newGroup(nameOf(char), space.pivot, line, made.groups, turn ? angles(turn) : [0, 0, 0]) : line
    for (const box of boxes) add(makeCube({ name: own ? nameOf(char) : name, box, space, paint }), group)
    letters.push({ glyph, boxes, group, space })
  }

  if (!outline?.triangles || !built.swatch || built.border <= 0) return line
  const swatch = swatchPaint(textures[0], pages[0], built.swatch)
  for (const { glyph, boxes, group, space } of letters) {
    const hull = built.runs ? hullOf(boxes, hullReach(built, outline, size), pages) : outlineBoxes(built, parts[glyph], outline, matrix)
    const outer = newOutline(space.pivot, group, made.groups)
    for (const box of hull) add(makeCube({ name: "outline", box, space, inverted: true, paint: swatch }), outer)
  }
  return line
}

function hullReach(built, outline, size) {
  return outline.scale.map((axis, index) => built.border * size.getComponent(index) / axis)
}

function buildMesh(element, frame, name, made) {
  const { item } = memberOf(element)
  const { built, outline } = item
  const { matrix, size, origin, rotation } = frame
  const pages = built.pages.map(page => page.texture)
  const textures = makeTextures(name, pages, made.textures)
  const faces = facesOf(built.body, matrix, pages)
  const line = newLine(name, origin, element, made.groups, angles(rotation))

  function add(options, group) {
    const mesh = makeMesh(options)
    mesh.visibility = element.visibility
    mesh.addTo(group).init()
    made.elements.push(mesh)
  }

  const letters = Array.from(Map.groupBy(faces, face => face.glyph), ([glyph, members]) => {
    const char = baseChar(built.chars?.[glyph] ?? "")
    const centre = new THREE.Box3().setFromPoints(members.flatMap(face => face.points)).getCenter(new THREE.Vector3())
    const own = built.chars?.length > 1
    const letter = own ? nameOf(char) : name
    const pivot = centre.clone().add(origin)
    const group = own ? newGroup(letter, pivot, line, made.groups) : line
    add({ name: letter, faces: members, centre, origin, textures }, group)
    return { glyph, members, centre, pivot, group }
  })
  if (!outline?.triangles || !built.swatch || built.border <= 0) return line
  const [u, v] = [built.swatch[0] * pages[0].width, (1 - built.swatch[1]) * pages[0].height]
  const parts = built.parts?.()
  for (const { glyph, members, centre, pivot, group } of letters) {
    const shell = built.runs ? hullOf(boxesOf(members), hullReach(built, outline, size), pages).flatMap(hullFaces) : facesOf(buildPartOutline(built, parts[glyph], outline.scale), outlineMatrix(outline, matrix), pages)
    add({ name: "outline", faces: shell.map(face => ({ ...face, page: 0, points: face.points.toReversed(), uvs: face.points.map(() => [u, v]) })), centre, origin, textures }, newOutline(pivot, group, made.groups))
  }
  return line
}

function hullFaces({ centre, half, quaternion, axes, members }) {
  return members.map(({ normal }) => {
    const [across, up] = axes.map((axis, index) => ({ axis, half: half[index] })).filter(({ axis }) => Math.abs(axis.dot(normal)) < 0.5)
    const reach = axes.reduce((sum, axis, index) => sum + Math.abs(axis.dot(normal)) * half[index], 0)
    const middle = centre.clone().addScaledVector(normal, reach)
    const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => middle.clone().addScaledVector(across.axis, a * across.half).addScaledVector(up.axis, b * up.half))
    const facing = points[1].clone().sub(points[0]).cross(points[3].clone().sub(points[0])).dot(normal)
    return { points: facing > 0 ? points : points.reverse() }
  })
}

const BUILDERS = { cubes: buildCubes, mesh: buildMesh }

export async function convert(elements, kind) {
  await Promise.all(elements.map(whenReady))
  for (const element of elements) {
    if (!memberOf(element).item?.built) throw new Error(runtimeOf(element).error ?? `${element.name || "This title"} has nothing to convert`)
  }
  const made = { groups: [], elements: [], textures: [] }
  Undo.initEdit({ outliner: true, elements, groups: [], textures: [], selection: true })
  try {
    for (const element of elements) BUILDERS[kind](element, frameOf(element), element.name || "title", made)
  } catch (err) {
    Undo.cancelEdit(true)
    throw err
  }
  sendStats(Project, elements.map(element => element.settings))
  unselectAllElements()
  for (const element of elements) element.remove()
  Undo.finishEdit(kind === "cubes" ? "Convert title to cubes" : "Convert title to mesh", { outliner: true, elements: made.elements, groups: made.groups, textures: made.textures, selection: true })
  Canvas.updateAll()
  made.groups[0]?.select()
  updateSelection()
  return made
}
