import * as THREE from "three"
import { effectScope, reactive, shallowRef, watch } from "vue"
import ModelRenderer from "../../src/render/ModelRenderer.js"
import ObjectRenderer from "../../src/render/ObjectRenderer.js"
import { createEntry, cullOutlines, destroyEntry, sortEntries, updateEntry } from "../../src/render/stage.js"
import { boxOf } from "../../src/render/bufferPoints.js"
import { gizmoPose, lineBounds } from "../../src/render/placement.js"
import { isModelShape } from "../../src/lib/geometry/shapes.js"
import { fullCamera } from "../../src/lib/settings/camera.js"
import { createTitleItems } from "../../src/lib/title/items.js"
import { keepMatched } from "../../src/lib/title/match.js"
import { createTitle } from "../../src/lib/title/title.js"
import { library } from "./library.js"
import { amendLastEdit, quietly, watchChanges } from "./undo.js"

// the site's titles face +z, and Blockbench models face north, which is -z
const FACING = new THREE.Matrix4().makeRotationY(Math.PI)

const titles = new Map()

function createProjectTitle(project) {
  const list = shallowRef([])
  const members = new Map()
  const scope = effectScope(true)
  const title = Object.defineProperty(createTitle(null, reactive({ render: false, previews: false, eager: false }), reactive(fullCamera())), "objects", { get: () => list.value })
  const state = { project, title, list, members, scope, sorted: null, changes: 0 }
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
  for (const item of items) {
    const member = state.members.get(item.id)
    if (!member) continue
    updateEntry(member.entry, item)
    place(member, item)
  }
  state.changes++
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
  member.pivot.set(0, 0, 0)
  if (built) member.pivot.copy(gizmoPose(transform, lineBounds(built)).position)
  member.pivot.applyMatrix4(FACING)
  const { group } = member.entry
  group.matrix.premultiply(FACING).premultiply(new THREE.Matrix4().makeTranslation(-member.pivot.x, -member.pivot.y, -member.pivot.z))
  group.visible = true
  member.body = built?.body.triangles ? boxOf(built.body) : null
  member.box = outlineBox(item)
  member.element.preview_controller.updatePlaced(member.element)
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
      if (node.children) visit(node.children)
      else order.push(node)
    }
  }
  visit(project.outliner ?? Outliner.root)
  return order
}

export function refreshList(state = titleState()) {
  const order = outlinerOrder(state.project)
  const elements = Array.from(state.members.values(), member => member.element)
  const next = order.filter(node => elements.includes(node)).concat(elements.filter(element => !order.includes(element))).map(element => element.settings)
  if (next.length !== state.list.value.length || next.some((object, index) => object !== state.list.value[index])) state.list.value = next
}

export function attach(element) {
  const state = titleState()
  const { settings } = element
  if (state.members.has(settings.id)) return
  const member = { element, state, entry: createEntry(), pivot: new THREE.Vector3(), body: null, box: null, item: null, scope: null }
  state.members.set(settings.id, member)
  refreshList(state)
  member.scope = startRenderer(state, settings)
  member.scope.run(() => watchChanges(element))
}

export function detach(element) {
  for (const state of titles.values()) {
    const member = state.members.get(element.settings.id)
    if (member?.element !== element) continue
    member.scope.stop()
    destroyEntry(member.entry)
    member.entry.group.parent?.remove(member.entry.group)
    state.members.delete(element.settings.id)
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
  return memberOf(element)?.state.title.runtime[element.settings.id] ?? {}
}

export function sortTitle(camera) {
  const state = titles.get(Project?.uuid)
  if (!state?.members.size) return
  const seen = `${state.changes} ${camera.matrixWorld.elements.join()} ${camera.projectionMatrix.elements.join()}`
  if (state.sorted === seen) return
  state.sorted = seen
  sortEntries(Array.from(state.members.values(), member => member.entry), camera)
  cullOutlines(Project.model_3d, camera)
}

export function closeTitle(project) {
  const state = titles.get(project.uuid)
  if (!state) return
  for (const member of Array.from(state.members.values())) detach(member.element)
  state.scope.stop()
  titles.delete(project.uuid)
}

export function closeTitles() {
  for (const state of Array.from(titles.values())) closeTitle(state.project)
}
