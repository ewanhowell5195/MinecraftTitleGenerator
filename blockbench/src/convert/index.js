import * as THREE from "three"
import { effectScope, watch } from "vue"
import { buildOutline } from "../../../src/lib/geometry/build.js"
import { CREEPER, TERMINATOR_CLOSE, TERMINATOR_OPEN, baseChar } from "../../../src/lib/font/order.js"
import { memberOf, runtimeOf } from "../titles.js"
import { hullOf, makeCube, sharedTurn, swatchPaint, texturedPaint } from "./cubes.js"
import { makeMesh } from "./mesh.js"
import { boxesOf, facesOf } from "./quads.js"

const FACING = new THREE.Matrix4().makeRotationY(Math.PI)
const STILL = new THREE.Quaternion()

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

function outlineOf({ built, outline }) {
  if (!built.slabs && !built.twist?.some(({ slabs }) => slabs)) return outline
  return buildOutline({ ...built, slabs: null, twist: built.twist?.map(part => ({ ...part, slabs: null })) ?? null }, outline.scale)
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

function nameOf(char) {
  return { [TERMINATOR_OPEN]: "open_terminator", [TERMINATOR_CLOSE]: "close_terminator", [CREEPER]: "creeper" }[char] ?? (char.trim() || "space")
}

function buildCubes(element, parts, name, made) {
  const { item } = memberOf(element)
  const { built } = item
  const outline = item.outline && outlineOf(item)
  const { matrix, size, origin, rotation } = parts
  const pages = built.pages.map(page => page.texture)
  const textures = makeTextures(name, pages, made.textures)
  const faces = facesOf(built.body, matrix, pages)
  const line = newGroup(name, origin, element, made.groups, angles(rotation))
  const paint = texturedPaint(textures)
  const all = []

  function add(cube, group) {
    cube.visibility = element.visibility
    cube.addTo(group).init()
    made.elements.push(cube)
  }

  for (const [glyph, members] of Map.groupBy(faces, face => face.glyph)) {
    const boxes = boxesOf(members)
    all.push(...boxes)
    const char = baseChar(built.chars?.[glyph] ?? "")
    const turn = sharedTurn(boxes)
    const middle = new THREE.Box3().setFromPoints(members.flatMap(face => face.points)).getCenter(new THREE.Vector3())
    const own = built.chars?.length > 1
    const group = own ? newGroup(nameOf(char), middle.clone().add(origin), line, made.groups, turn ? angles(turn) : [0, 0, 0]) : line
    const turned = own && turn
    const space = { centre: turned ? middle : new THREE.Vector3(), turn: turned ? turn : STILL, origin, pivot: new THREE.Vector3(...group.origin) }
    for (const box of boxes) add(makeCube({ name: own ? nameOf(char) : name, box, space, paint }), group)
  }

  if (!outline?.triangles || !built.swatch || built.border <= 0) return line
  const swatch = swatchPaint(textures[0], pages[0], built.swatch)
  const outer = newGroup("outline", origin, line, made.groups)
  const space = { centre: new THREE.Vector3(), turn: STILL, origin, pivot: origin }
  const hull = built.runs ? hullOf(all, outline.scale.map((axis, index) => built.border * size.getComponent(index) / axis), pages) : boxesOf(facesOf(outline, outlineMatrix(outline, matrix), pages))
  for (const box of hull) add(makeCube({ name: "outline", box, space, inverted: true, paint: swatch }), outer)
  return line
}

function buildMesh(element, parts, name, made) {
  const { item } = memberOf(element)
  const { built } = item
  const outline = item.outline && outlineOf(item)
  const { matrix, size, origin, rotation } = parts
  const pages = built.pages.map(page => page.texture)
  const textures = makeTextures(name, pages, made.textures)
  const faces = facesOf(built.body, matrix, pages)
  const line = newGroup(name, origin, element, made.groups, angles(rotation))

  function add(options) {
    const mesh = makeMesh(options)
    mesh.visibility = element.visibility
    mesh.addTo(line).init()
    made.elements.push(mesh)
  }

  for (const [glyph, members] of Map.groupBy(faces, face => face.glyph)) {
    const char = baseChar(built.chars?.[glyph] ?? "")
    const middle = new THREE.Box3().setFromPoints(members.flatMap(face => face.points)).getCenter(new THREE.Vector3())
    add({ name: built.chars?.length > 1 ? nameOf(char) : name, faces: members, centre: middle, origin, textures })
  }
  if (!outline?.triangles || !built.swatch || built.border <= 0) return line
  const [u, v] = [built.swatch[0] * pages[0].width, (1 - built.swatch[1]) * pages[0].height]
  const shell = built.runs ? hullOf(boxesOf(faces), outline.scale.map((axis, index) => built.border * size.getComponent(index) / axis), pages).flatMap(hullFaces) : facesOf(outline, outlineMatrix(outline, matrix), pages)
  add({ name: "outline", faces: shell.map(face => ({ ...face, page: 0, points: face.points.toReversed(), uvs: face.points.map(() => [u, v]) })), centre: new THREE.Vector3(), origin, textures })
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
  unselectAllElements()
  for (const element of elements) element.remove()
  Undo.finishEdit(kind === "cubes" ? "Convert title to cubes" : "Convert title to mesh", { outliner: true, elements: made.elements, groups: made.groups, textures: made.textures, selection: true })
  Canvas.updateAll()
  made.groups[0]?.select()
  updateSelection()
  return made
}
