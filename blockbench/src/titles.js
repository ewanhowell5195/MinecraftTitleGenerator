import * as THREE from "three"
import { effectScope, reactive, shallowRef, watch } from "vue"
import ModelRenderer from "../../src/render/ModelRenderer.js"
import ObjectRenderer from "../../src/render/ObjectRenderer.js"
import { createEntry, cullOutlines, destroyEntry, sortEntries, updateEntry } from "../../src/render/stage.js"
import { boxOf } from "../../src/render/bufferPoints.js"
import { plainCopy } from "../../src/lib/core/values.js"
import { isModelShape, loadKey } from "../../src/lib/geometry/shapes.js"
import { fullCamera } from "../../src/lib/settings/camera.js"
import { createTitleItems } from "../../src/lib/title/items.js"
import { LINE } from "../../src/lib/settings/settings.js"
import { keepMatched } from "../../src/lib/title/match.js"
import { keepTexture } from "../../src/lib/title/objects.js"
import { createTitle } from "../../src/lib/title/title.js"
import { FORMAT } from "./format.js"
import { library } from "./library.js"
import { stackEntries } from "./passes.js"
import { FACING, pivotOf, wordCentre, wordMatrix } from "./placing.js"
import { amendLastEdit, quietly, watchChanges } from "./undo.js"

const LINE_KEYS = Array.from(LINE)

const titles = new Map()

function createProjectTitle(project) {
  const list = shallowRef([])
  const members = new Map()
  const scope = effectScope(true)
  const title = Object.defineProperty(createTitle(null, reactive({ render: false, previews: false, eager: false }), reactive(fullCamera())), "objects", { get: () => list.value })
  const state = { project, title, list, members, lines: new Map(), homes: new Map(), scope, settling: false, sorted: null, stacks: null, changes: 0 }
  title.quietly = change => {
    quietly(change)
    amendLastEdit(Array.from(members.values(), member => member.element))
  }
  scope.run(() => {
    keepMatched(title)
    watch(createTitleItems(title), items => sync(state, items), { immediate: true })
  })
  return state
}

export function titleState(project = Project) {
  if (!titles.has(project.uuid)) titles.set(project.uuid, createProjectTitle(project))
  return titles.get(project.uuid)
}

function sync(state, items) {
  const lines = new Set()
  for (const item of items) {
    const member = state.members.get(item.id)
    if (!member) continue
    updateEntry(member.entry, item)
    member.entry.materials.forEach(drawWithCubes)
    place(member, item)
    if (member.element.line) lines.add(member.element.line)
  }
  for (const line of lines) placeLine(state, line)
  state.changes++
}

function drawWithCubes(material) {
  material.transparent = true
  material.blending = THREE.NoBlending
}

function outlineBox({ built, outline }) {
  if (!built?.body.triangles) return null
  if (!outline?.triangles) return boxOf(built.body)
  const box = boxOf(outline).clone()
  const scale = new THREE.Vector3(...outline.scale)
  box.min.divide(scale)
  box.max.divide(scale)
  return box
}

function place(member, item) {
  const { built, transform } = item
  member.item = item
  if (!transform) return
  member.pivot.copy(pivotOf(item))
  const { group } = member.entry
  group.matrix.premultiply(FACING).premultiply(new THREE.Matrix4().makeTranslation(-member.pivot.x, -member.pivot.y, -member.pivot.z))
  if (member.element.line) {
    member.centre.copy(wordCentre(item, member.pivot))
    group.matrix.premultiply(wordMatrix(item, member.pivot).invert())
  }
  group.visible = true
  member.body = built?.body.triangles ? boxOf(built.body) : null
  member.box = outlineBox(item)
  member.element.preview_controller.updatePlaced(member.element)
}

function placeLine(state, element) {
  const line = state.lines.get(element.uuid)
  const members = element.words.map(memberOf).filter(member => member?.item?.transform)
  const first = members.find(member => member.item.built)
  if (!line || !first) return
  line.pivot.copy(first.pivot)
  element.preview_controller.updateTransform(element)
  line.box = new THREE.Box3()
  for (const { box, element: word, entry } of members) {
    if (!box) continue
    word.mesh.updateMatrix()
    line.box.union(box.clone().applyMatrix4(entry.group.matrix).applyMatrix4(word.mesh.matrix))
  }
  if (line.box.isEmpty()) line.box = null
  const { min, max } = first.item.built.line
  line.body = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))
  element.preview_controller.updatePlaced(element)
}

function startRenderer(state, object) {
  const scope = effectScope(true)
  scope.run(() => {
    let running = null
    watch(() => library.ready ? isModelShape(library.shapes, object.shape) ? ModelRenderer : ObjectRenderer : null, renderer => {
      running?.stop()
      running = null
      if (!renderer) return
      running = effectScope()
      running.run(() => renderer.setup({ object, title: state.title, fonts: library.fonts, shapes: library.shapes, tileables: library.tileables }))
    }, { immediate: true })
  })
  return scope
}

function outlinerOrder(project) {
  const order = []
  function visit(nodes) {
    for (const node of nodes) {
      if (node.children?.length) visit(node.children)
      else order.push(node)
    }
  }
  visit(project.outliner ?? Outliner.root)
  return order
}

function startLine(state, element) {
  if (state.lines.has(element.uuid)) return
  const scope = effectScope(true)
  state.lines.set(element.uuid, { element, pivot: new THREE.Vector3(), box: null, body: null, scope })
  const first = () => state.list.value.find(object => object.group === element.uuid)
  scope.run(() => {
    watch(() => {
      const object = first()
      return object && LINE_KEYS.map(key => object[key])
    }, values => values && quietly(() => LINE_KEYS.forEach((key, index) => (element.settings[key] = values[index]))), { flush: "sync" })
    watch(() => state.list.value && element.describe(), (description, described) => {
      if (element.name === described) element.name = description
    }, { flush: "sync" })
  })
}

function stopLine(state, uuid) {
  state.lines.get(uuid).scope.stop()
  state.lines.delete(uuid)
}

function join(word, line) {
  const { settings } = word
  if (settings.group === line.uuid) return
  const source = line.words.find(other => other !== word && other.settings.group === line.uuid)?.settings ?? line.settings
  const values = Object.fromEntries(LINE_KEYS.map(key => [key, plainCopy(source[key])]))
  if (!memberOf(word) || loadKey(settings) !== loadKey({ ...settings, ...values })) keepTexture.add(settings)
  quietly(() => Object.assign(settings, values, { group: line.uuid }))
}

function moveOut(element) {
  for (const child of element.children?.filter(child => !child.isWord).reverse() ?? []) {
    child.sortInBefore(element, 1)
    child.preview_controller.updateTransform(child)
  }
}

function settle(state) {
  const elements = state.project.elements.filter(element => element.settings && element.describe)
  elements.forEach(moveOut)
  const lines = new Set(elements.filter(element => element.words.length))
  for (const line of lines) startLine(state, line)
  for (const uuid of Array.from(state.lines.keys())) {
    if (!lines.has(state.lines.get(uuid).element)) stopLine(state, uuid)
  }
  for (const element of elements) {
    if (element.line && lines.has(element.line)) {
      join(element, element.line)
      state.homes.set(element.uuid, element.line.uuid)
      start(state, element)
    } else if (element.isWord || lines.has(element)) stop(state, element)
    else if (!element.temp_data.awaitsWords) start(state, element)
  }
}

function keepMatches(state) {
  for (const object of state.list.value) {
    if (object.matchWidth === null || state.members.has(object.matchWidth)) continue
    const home = state.homes.get(object.matchWidth) ?? object.matchWidth
    const word = state.lines.get(home)?.element.words[0]
    if (word || state.members.has(home)) quietly(() => (object.matchWidth = word ? word.uuid : home))
  }
}

export function homeOf(id) {
  if (id === null) return null
  for (const state of titles.values()) {
    if (state.homes.has(id)) return state.homes.get(id)
  }
  return id
}

export function lineOf(element) {
  return titles.get(Project?.uuid)?.lines.get(element.uuid) ?? null
}

export function settleTitle() {
  const state = titleState()
  for (const element of state.project.elements) delete element.temp_data.awaitsWords
  refreshList(state)
  for (const { element } of state.lines.values()) {
    for (const shown of [element].concat(element.words)) shown.preview_controller.updateTransform(shown)
  }
}

export function refreshList(state = titleState()) {
  if (state.settling) return
  state.settling = true
  try {
    settle(state)
  } finally {
    state.settling = false
  }
  const order = outlinerOrder(state.project)
  const elements = Array.from(state.members.values(), member => member.element)
  const next = order.filter(node => elements.includes(node)).concat(elements.filter(element => !order.includes(element))).map(element => element.settings)
  if (next.length !== state.list.value.length || next.some((object, index) => object !== state.list.value[index])) state.list.value = next
  keepMatches(state)
}

export function attach() {
  refreshList()
}

function start(state, element) {
  const { settings } = element
  if (state.members.has(settings.id)) return
  const member = { element, state, entry: createEntry(), pivot: new THREE.Vector3(), centre: new THREE.Vector3(), body: null, box: null, item: null, scope: null }
  for (const material of ["body", "border", "rim", "clip"]) drawWithCubes(member.entry[material])
  state.members.set(settings.id, member)
  state.list.value = state.list.value.concat(settings)
  member.scope = startRenderer(state, settings)
  member.scope.run(() => watchChanges(element))
}

function stop(state, element) {
  const member = state.members.get(element.settings.id)
  if (member?.element !== element) return
  member.scope.stop()
  destroyEntry(member.entry)
  member.entry.group.parent?.remove(member.entry.group)
  state.members.delete(element.settings.id)
  element.settings.group = null
}

export function detach(element) {
  for (const state of titles.values()) {
    stop(state, element)
    refreshList(state)
  }
}

export function memberOf(element) {
  for (const state of titles.values()) {
    const member = state.members.get(element.settings.id)
    if (member?.element === element) return member
  }
  return null
}

export function elementOf(object) {
  for (const state of titles.values()) {
    const member = state.members.get(object.id)
    if (member) return member.element
  }
  return null
}

export function runtimeOf(element) {
  const member = memberOf(element.words[0] ?? element)
  return member?.state.title.runtime[member.element.settings.id] ?? {}
}

function squeezeOrders(entries) {
  const reach = entries.length * 3
  for (const entry of entries) {
    for (const part of ["halo", "holes", "outline", "solid", "letters"]) {
      if (entry[part]) entry[part].renderOrder = (entry[part].renderOrder + reach + 1) / (reach * 2 + 2) - 1
    }
  }
}

export function resort() {
  if (Project) Object.assign(titleState(), { sorted: null, stacks: null })
}

export function sortTitle(camera) {
  if (!Project || Format.id !== FORMAT) return
  const state = titleState()
  const seen = `${state.changes} ${camera.matrixWorld.elements.join()} ${camera.projectionMatrix.elements.join()}`
  if (state.sorted === seen) return
  state.sorted = seen
  state.stacks ??= stackEntries()
  const entries = Array.from(state.members.values(), member => member.entry).concat(state.stacks)
  sortEntries(entries, camera)
  squeezeOrders(entries)
  cullOutlines(Project.model_3d, camera)
}

export function closeTitle(project) {
  const state = titles.get(project.uuid)
  if (!state) return
  for (const uuid of Array.from(state.lines.keys())) stopLine(state, uuid)
  for (const member of Array.from(state.members.values())) stop(state, member.element)
  state.scope.stop()
  titles.delete(project.uuid)
}

export function closeTitles() {
  for (const state of Array.from(titles.values())) closeTitle(state.project)
}
