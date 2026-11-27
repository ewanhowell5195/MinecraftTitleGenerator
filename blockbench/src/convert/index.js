import * as THREE from "three"
import { effectScope, watch } from "vue"
import { buildPartOutline, turned } from "#lib/geometry/build.js"
import { CREEPER, TERMINATOR_CLOSE, TERMINATOR_OPEN, baseChar } from "#lib/font/order.js"
import { RENDER_ORDER, SHARE } from "../passes.js"
import { FACING } from "../placing.js"
import { sendStats } from "../stats.js"
import { lineOf, memberOf, runtimeOf } from "../titles.js"
import { familyOf } from "../words.js"
import { allSides, angles, hullOf, makeCube, reachAlong, round, sharedTurn, swatchPaint, texturedPaint, wholeSides } from "./cubes.js"
import { makeMesh } from "./mesh.js"
import { boxesOf, facesOf, solidBox, solidPoints } from "./quads.js"

const STILL = new THREE.Quaternion()
const OUTLINE_ORDER = -1
const VIEWER = new THREE.Vector3(0, -166, -302)

function piecesOf(element) {
  return element.words.length ? element.words : [element]
}

export function isCubes(element) {
  return piecesOf(element).every(piece => {
    const { item } = memberOf(piece) ?? {}
    return !!item?.built && !item.built.body.sizes && !item.built.shapes
  })
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

function facedFrame(placement, origin) {
  const turn = new THREE.Quaternion()
  const size = new THREE.Vector3()
  placement.decompose(new THREE.Vector3(), turn, size)
  const base = new THREE.Quaternion().setFromRotationMatrix(FACING).invert().premultiply(turn)
  return { base, matrix: new THREE.Matrix4().makeRotationFromQuaternion(base.clone().invert()).multiply(placement), size, origin, rotation: base }
}

function ownTurn(element) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...element.rotation.map(Math.degToRad), Format.euler_order))
}

function frameOf(element) {
  const { entry, pivot } = memberOf(element)
  const frame = facedFrame(entry.group.matrix, new THREE.Vector3(...element.position).add(pivot))
  return { ...frame, rotation: ownTurn(element).multiply(frame.base) }
}

function wordFrame(word, line) {
  const { entry } = memberOf(word)
  word.mesh.updateMatrix()
  const centre = word.mesh.position.clone()
  const placement = new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z).multiply(word.mesh.matrix).multiply(entry.group.matrix)
  const inLine = new THREE.Matrix4().makeRotationFromQuaternion(line.base.clone().invert())
  return facedFrame(inLine.clone().multiply(placement), centre.applyMatrix4(inLine).add(line.origin))
}

function lineFrame(element) {
  const [first] = element.words
  const { pivot } = lineOf(element)
  const still = new THREE.Matrix4().makeTranslation(-first.mesh.position.x, -first.mesh.position.y, -first.mesh.position.z)
  const unturned = first.mesh.matrix.clone().multiply(memberOf(first).entry.group.matrix).premultiply(still)
  unturned.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(first.mesh.quaternion.clone().invert()))
  const frame = facedFrame(unturned, new THREE.Vector3(...element.position).add(pivot))
  return { ...frame, rotation: ownTurn(element).multiply(frame.base) }
}

function farthestFirst(words) {
  return words.slice().sort((a, b) => b.mesh.position.distanceTo(VIEWER) - a.mesh.position.distanceTo(VIEWER))
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

function newOutline(origin, parent, made, order) {
  const group = newGroup("outline", origin, parent, made)
  group[RENDER_ORDER] = order
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

function buildElements(element, kind, frame, name, made, line, order) {
  const { built, outline } = memberOf(element).item
  const { matrix, size, origin } = frame
  const pages = built.pages.map(page => page.texture)
  const textures = makeTextures(name, pages, made.textures)
  const parts = built.parts?.()
  const own = built.chars?.length > 1
  const cubes = kind === "cubes"
  const paint = texturedPaint(textures)

  function add(node, group) {
    node.addTo(group).init()
    made.elements.push(node)
  }

  const letters = Array.from(Map.groupBy(facesOf(built.body, matrix, pages), face => face.glyph), ([glyph, members]) => {
    const letter = own ? nameOf(baseChar(built.chars?.[glyph] ?? "")) : name
    const centre = new THREE.Box3().setFromPoints(members.flatMap(face => face.points)).getCenter(new THREE.Vector3())
    if (!cubes) {
      const pivot = centre.clone().add(origin)
      const group = own ? newGroup(letter, pivot, line, made.groups) : line
      add(makeMesh({ name: letter, faces: members, centre, origin, textures }), group)
      return { glyph, members, centre, pivot, group }
    }
    const boxes = boxesIn(members, parts?.[glyph].turn, matrix)
    const turn = sharedTurn(boxes)
    const turned = own && turn
    const space = { centre: turned ? centre : new THREE.Vector3(), turn: turned ? turn : STILL, origin, pivot: own ? centre.clone().add(origin) : origin }
    const group = own ? newGroup(letter, space.pivot, line, made.groups, turn ? angles(turn) : [0, 0, 0]) : line
    for (const box of boxes) add(makeCube({ name: letter, box, space, paint }), group)
    return { glyph, boxes, group, space, pivot: space.pivot }
  })

  if (!outline?.triangles || !built.swatch || built.border <= 0) return
  const reach = outline.scale.map((axis, index) => built.border * size.getComponent(index) / axis)
  const swatch = swatchPaint(textures[0], pages[0], built.swatch)
  const [u, v] = [built.swatch[0] * pages[0].width, (1 - built.swatch[1]) * pages[0].height]
  for (const { glyph, members, boxes, centre, space, pivot, group } of letters) {
    const hull = built.runs && hullOf(boxes ?? boxesOf(members), reach, pages)
    if (cubes) {
      const outer = newOutline(pivot, group, made.groups, order)
      for (const box of hull || outlineBoxes(built, parts[glyph], outline, matrix)) add(makeCube({ name: "outline", box, space, inverted: true, paint: swatch }), outer)
      continue
    }
    const shell = hull ? hull.flatMap(hullFaces) : facesOf(buildPartOutline(built, parts[glyph], outline.scale), outlineMatrix(outline, matrix), pages)
    const outer = newOutline(pivot, group, made.groups, order)
    add(makeMesh({ name: "outline", faces: shell.map(face => ({ ...face, page: 0, points: face.points.toReversed(), uvs: face.points.map(() => [u, v]) })), centre, origin, textures }), outer)
  }
}

function hullFaces({ centre, half, quaternion, axes, members }) {
  return members.map(({ normal }) => {
    const [across, up] = axes.map((axis, index) => ({ axis, half: half[index] })).filter(({ axis }) => Math.abs(axis.dot(normal)) < 0.5)
    const middle = centre.clone().addScaledVector(normal, reachAlong({ axes, half }, normal))
    const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => middle.clone().addScaledVector(across.axis, a * across.half).addScaledVector(up.axis, b * up.half))
    const facing = points[1].clone().sub(points[0]).cross(points[3].clone().sub(points[0])).dot(normal)
    return { points: facing > 0 ? points : points.reverse() }
  })
}

function buildPiece(element, kind, frame, name, made, group, order) {
  const own = { groups: [group], elements: [], textures: made.textures }
  buildElements(element, kind, frame, name, own, group, order)
  if (element.settings.hidden) for (const node of own.groups.concat(own.elements)) node.visibility = false
  made.groups.push(...own.groups.slice(1))
  made.elements.push(...own.elements)
}

function buildLine(element, kind, made) {
  const name = element.name || "title"
  if (!element.words.length) {
    const frame = frameOf(element)
    buildPiece(element, kind, frame, name, made, newLine(name, frame.origin, element, made.groups, angles(frame.rotation)), OUTLINE_ORDER)
    return
  }
  const frame = lineFrame(element)
  const line = newLine(name, frame.origin, element, made.groups, angles(frame.rotation))
  line.visibility = element.words.some(word => !word.settings.hidden)
  const order = farthestFirst(element.words)
  for (const word of element.words) {
    const own = wordFrame(word, frame)
    const group = newGroup(word.name || "word", own.origin, line, made.groups, angles(own.rotation))
    buildPiece(word, kind, own, word.name || "word", made, group, OUTLINE_ORDER * (order.length - order.indexOf(word)))
  }
}

export async function convert(elements, kind) {
  const pieces = elements.flatMap(piecesOf)
  await Promise.all(pieces.map(whenReady))
  for (const piece of pieces) {
    if (!memberOf(piece).item?.built) throw new Error(runtimeOf(piece).error ?? `${piece.name || "This title"} has nothing to convert`)
  }
  const made = { groups: [], elements: [], textures: [] }
  Undo.initEdit({ outliner: true, elements: elements.flatMap(familyOf), groups: [], textures: [], selection: true })
  try {
    for (const element of elements) buildLine(element, kind, made)
  } catch (err) {
    Undo.cancelEdit(true)
    throw err
  }
  sendStats(Project, pieces.map(piece => piece.settings))
  unselectAllElements()
  for (const element of elements) element.remove()
  Undo.finishEdit(kind === "cubes" ? "Convert title to cubes" : "Convert title to mesh", { outliner: true, elements: made.elements, groups: made.groups, textures: made.textures, selection: true })
  Canvas.updateAll()
  made.groups[0]?.select()
  updateSelection()
  return made
}
