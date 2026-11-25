import * as THREE from "three"
import { isTitle } from "./elements.js"
import { FORMAT } from "./format.js"

export const RENDER_ORDER = "minecraft_title_render_order"
export const SHARE = "minecraft_title_share_render_order"
const IGNORE_SHADING = "minecraft_title_ignore_shading"

const ORDINARY = { behind: -3, default: -2, in_front: 1 }
const { onBeforeRender, onAfterRender } = THREE.Object3D.prototype

const properties = []

function orderOf(node) {
  return node instanceof Group ? node[RENDER_ORDER] ?? 0 : 0
}

function sharedItems(group, inherited = 0) {
  return group.children.flatMap(child => {
    const order = orderOf(child) || inherited
    return child instanceof Group && !child[SHARE] ? sharedItems(child, order) : [{ order, node: child }]
  })
}

function ordersIn(group) {
  const items = group[SHARE] ? sharedItems(group) : group.children.map(node => ({ order: orderOf(node), node }))
  return Array.from(Map.groupBy(items, item => item.order)).sort(([a], [b]) => a - b).map(([, found]) => found.map(item => item.node))
}

function passesOf(node) {
  if (!(node instanceof Group)) return [{ elements: [node], depth: true }]
  const orders = ordersIn(node)
  return orders.flatMap((nodes, index) => {
    const own = nodes.map(passesOf)
    const plain = own.filter(passes => passes.length === 1).flatMap(([pass]) => pass.elements)
    const passes = (plain.length ? [{ elements: plain, depth: true }] : []).concat(own.filter(passes => passes.length > 1).flat())
    return index === orders.length - 1 ? passes : passes.map(pass => ({ ...pass, depth: false }))
  })
}

function stacksIn(nodes) {
  return nodes.filter(node => node instanceof Group).flatMap(group => ordersIn(group).length > 1 ? [group] : stacksIn(group.children))
}

function setShade(material, value) {
  material.uniforms.SHADE.value = value
  material.uniformsNeedUpdate = true
}

function draw(element, order, depth = true) {
  const { mesh } = element
  let shaded = false
  mesh.renderOrder = order
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material) => {
    if (!depth) material.depthWrite = false
    shaded = Format.id === FORMAT && element[IGNORE_SHADING] && !!material.uniforms?.SHADE?.value
    if (shaded) setShade(material, false)
  }
  mesh.onAfterRender = (renderer, scene, camera, geometry, material) => {
    if (!depth) material.depthWrite = true
    if (shaded) setShade(material, true)
  }
}

function release(mesh) {
  Object.assign(mesh, { renderOrder: 0, onBeforeRender, onAfterRender })
}

function stackEntry(group) {
  const passes = passesOf(group).map(pass => ({ ...pass, elements: pass.elements.filter(element => !isTitle(element) && element.mesh) })).filter(pass => pass.elements.length)
  let order = 0
  return {
    group: group.mesh,
    line: group.uuid,
    outline: {
      get renderOrder() {
        return order
      },
      set renderOrder(value) {
        order = value
        for (const [index, { elements, depth }] of passes.entries()) {
          for (const element of elements) draw(element, value + (index - passes.length) / passes.length, depth)
        }
      }
    }
  }
}

export function stackEntries() {
  const stacks = stacksIn(Outliner.root)
  for (const element of Outliner.elements) {
    if (isTitle(element) || !element.mesh) continue
    if (element.constructor.properties[IGNORE_SHADING]) element[IGNORE_SHADING] ??= true
    draw(element, ORDINARY[element.render_order] ?? ORDINARY.default)
  }
  return stacks.map(stackEntry)
}

export function registerPasses() {
  const condition = { formats: [FORMAT] }
  properties.push(
    new Property(Group, "number", RENDER_ORDER, { condition, inputs: { element_panel: { input: { label: "Render Order", description: "Groups next to each other are drawn from the lowest order to the highest, and each one is covered by the ones after it", type: "number" } } } }),
    new Property(Group, "boolean", SHARE, { condition, inputs: { element_panel: { input: { label: "Share Render Order", description: "Compares the render order of every group inside this one, however deep, instead of only groups next to each other", type: "checkbox" } } } })
  )
  for (const type of [Cube, Mesh]) {
    properties.push(new Property(type, "boolean", IGNORE_SHADING, { default: true, condition, inputs: { element_panel: { input: { label: "Ignore Shading", description: "Keeps this unshaded like titles are, even while shading is on", type: "checkbox" } } } }))
  }
}

export function unregisterPasses() {
  for (const project of ModelProject.all) {
    for (const element of project.elements) {
      const mesh = project.nodes_3d[element.uuid]
      if (!mesh) continue
      release(mesh)
      if (project === Project) element.preview_controller.updateRenderOrder?.(element)
    }
  }
  for (const property of properties.splice(0)) property.delete()
}
