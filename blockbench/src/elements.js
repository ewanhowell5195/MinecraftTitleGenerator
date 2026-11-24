import * as THREE from "three"
import { createObject } from "../../src/lib/settings/objects.js"
import { restore, snapshot } from "../../src/lib/settings/settings.js"
import { FILE_VERSION } from "../../src/lib/settings/upgrades.js"
import { titleValues, trimmed } from "../../src/lib/link/titleLines.js"
import { keepTexture } from "../../src/lib/title/objects.js"
import { loadKey, shapeName } from "../../src/lib/geometry/shapes.js"
import { library } from "./library.js"
import { attach, detach, memberOf, refreshList } from "./titles.js"
import { quietly } from "./undo.js"

export const TEXT = "minecraft_title_text"
export const SHAPE = "minecraft_title_shape"

const PROPERTIES = [["string", "name", "text"], ["vector", "position"], ["vector", "rotation"], ["vector", "scale", [1, 1, 1]], ["boolean", "visibility", true], ["boolean", "locked", false]]
const SCALES = ["scaleX", "scaleY", "scaleZ"]
const UNSAVED = new Set(SCALES.concat("hidden", "matchWidth", "matchScale", "matchOffset"))

export const types = {}
export const isTitle = element => element instanceof types.base

function defineElements() {
  class TitleElement extends OutlinerElement {
    constructor(data, uuid) {
      super(data, uuid)
      for (const key in this.constructor.properties) this.constructor.properties[key].reset(this)
      this.color = 0
      this._static.properties.settings = createObject(this.startingSettings())
      this.settings.id = this.uuid
      if (data && typeof data === "object") this.extend(data)
    }
    startingSettings() {
      return {}
    }
    get settings() {
      return this._static.properties.settings
    }
    get origin() {
      return this.position
    }
    get mesh() {
      return Project.nodes_3d[this.uuid]
    }
    init() {
      super.init()
      attach(this)
      return this
    }
    remove() {
      detach(this)
      return super.remove()
    }
    extend(data) {
      for (const key in this.constructor.properties) this.constructor.properties[key].merge(this, data)
      const values = data instanceof TitleElement ? snapshot(data.settings) : data.title && titleValues({ version: data.title_version, lines: [data.title] })[0][0]
      if (values) this.useSettings({ ...values, group: this.settings.group, matchWidth: data instanceof TitleElement ? data.settings.matchWidth : data.match_width ?? null })
      this.sanitizeName()
      this.sendTransform()
      return this
    }
    useSettings(values) {
      const { settings } = this
      const loads = loadKey(settings) !== loadKey({ ...settings, ...values })
      if (loads || !memberOf(this)) keepTexture.add(settings)
      quietly(() => restore(settings, values))
    }
    sendTransform() {
      const { scale, settings } = this
      for (const [axis, key] of SCALES.entries()) {
        if (settings[key] !== scale[axis]) settings[key] = scale[axis]
      }
      if (settings.hidden === this.visibility) settings.hidden = !this.visibility
    }
    savedSettings() {
      return { title: trimmed(this.settings, UNSAVED), match_width: this.settings.matchWidth }
    }
    savedData() {
      const { type, uuid } = this
      const data = { type, uuid, title_version: FILE_VERSION, ...this.savedSettings() }
      for (const key in this.constructor.properties) this.constructor.properties[key].copy(this, data)
      return data
    }
    getUndoCopy() {
      return this.savedData()
    }
    getSaveCopy() {
      return { ...this.savedData(), ...(this.export === false && { export: false }) }
    }
    getWorldCenter() {
      return this.mesh ? THREE.fastWorldPosition(this.mesh, new THREE.Vector3()) : new THREE.Vector3()
    }
    size(axis) {
      const body = memberOf(this)?.body
      const sizes = body ? body.getSize(new THREE.Vector3()).toArray().map((size, index) => size * this.scale[index]) : [0, 0, 0]
      return axis === undefined ? sizes : sizes[axis]
    }
    getSize(axis) {
      return this.size(axis)
    }
    resize(value, axis, negative) {
      const scale = this.temp_data.old_scale ??= this.scale.slice()
      if (typeof value === "function") {
        this.scale[axis] = value(this.scale[axis])
        delete this.temp_data.old_scale
      } else {
        const before = this.temp_data.old_size?.[axis]
        if (!before) return this
        this.scale[axis] = scale[axis] * (before + (negative ? -value : value)) / before
      }
      this.scale[axis] = Math.max(0.05, Math.roundTo(this.scale[axis], 4))
      this.preview_controller.updateTransform(this)
      TickUpdates.selection = true
      return this
    }
    setColor(index) {
      this.color = index
    }
    get temp_data() {
      return this._static.temp_data
    }
    showContextMenu(event) {
      if (this.locked) return this
      if (!this.selected) this.clickSelect(event)
      this.menu.open(event, this)
      return this
    }
    describe() {
      const { settings } = this
      return settings.shape === null ? settings.text.trim() : shapeName(library.shapes, settings.shape)
    }
    sanitizeName() {
      return this.name
    }
    static behavior = {
      unique_name: false,
      movable: true,
      rotatable: true,
      resizable: true,
      scalable: true,
      has_pivot: false
    }
  }

  class TitleText extends TitleElement {
    static properties = {}
    static behavior = { ...TitleElement.behavior }
  }

  class TitleShape extends TitleElement {
    static properties = {}
    static behavior = { ...TitleElement.behavior }
    startingSettings() {
      return { shape: "heart" }
    }
  }

  return { base: TitleElement, text: TitleText, shape: TitleShape }
}

function register(type, id, { title, icon, name }) {
  Object.assign(type.prototype, {
    title,
    icon,
    type: id,
    menu: new Menu([...Outliner.control_menu_group, new MenuSeparator("settings"), new MenuSeparator("convert"), "convert_minecraft_title_to_cubes", "convert_minecraft_title_to_mesh", new MenuSeparator("manage"), "rename", "toggle_visibility", "delete"]),
    buttons: [Outliner.buttons.locked, Outliner.buttons.visibility]
  })
  for (const [kind, key, value] of PROPERTIES) new Property(type, kind, key, value === undefined ? {} : { default: key === "name" ? name : value })
  OutlinerElement.registerType(type, id)
  definePreview(type)
}

function boxEdges(box) {
  const solid = new THREE.BoxGeometry(...box.getSize(new THREE.Vector3()).toArray()).translate(...box.getCenter(new THREE.Vector3()).toArray())
  const edges = new THREE.EdgesGeometry(solid)
  solid.dispose()
  return edges
}

function definePreview(type) {
  const shared = NodePreviewController.prototype
  new NodePreviewController(type, {
    setup(element) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), Canvas.emptyMaterials[0])
      mesh.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(), 3))
      Project.nodes_3d[element.uuid] = mesh
      mesh.name = element.uuid
      mesh.type = element.type
      mesh.isElement = true
      mesh.frustumCulled = false
      mesh.rotation.order = Format.euler_order
      mesh.raycast = (raycaster, found) => raycastTitle(element, raycaster, found)
      const outline = new THREE.LineSegments(new THREE.BufferGeometry(), Canvas.outlineMaterial)
      outline.no_export = true
      outline.name = `${element.uuid}_outline`
      outline.visible = element.selected
      outline.renderOrder = 100
      outline.frustumCulled = false
      outline.matrixAutoUpdate = false
      mesh.outline = outline
      mesh.add(outline)
      this.updateTransform(element)
      mesh.visible = element.visibility
      this.dispatchEvent("setup", { element })
    },
    updateTransform(element) {
      element.sendTransform()
      const { mesh } = element
      shared.updateTransform.call(this, element)
      mesh.scale.set(1, 1, 1)
      const member = memberOf(element)
      if (member) {
        mesh.position.add(member.pivot)
        if (member.entry.group.parent !== mesh) mesh.add(member.entry.group)
      }
      mesh.updateMatrixWorld(true)
    },
    updatePlaced(element) {
      const member = memberOf(element)
      const { outline } = element.mesh
      this.updateTransform(element)
      outline.geometry.dispose()
      outline.geometry = member.box ? boxEdges(member.box) : new THREE.BufferGeometry()
      outline.matrix.copy(member.entry.group.matrix)
      outline.updateMatrixWorld(true)
      if (element.selected) TickUpdates.selection = true
    },
    updateVisibility(element) {
      element.sendTransform()
      shared.updateVisibility.call(this, element)
    },
    updateAll(element) {
      if (!element.mesh) this.setup(element)
      this.updateTransform(element)
      this.updateVisibility(element)
      refreshList()
      this.dispatchEvent("update_all", { element })
    },
    remove(element) {
      const outline = element.mesh?.outline
      shared.remove.call(this, element)
      outline?.geometry.dispose()
    }
  })
}

function raycastTitle(element, raycaster, found) {
  const entry = memberOf(element)?.entry
  if (!entry || Modes.paint) return
  const hits = raycaster.intersectObjects([entry.solid, entry.outline].filter(Boolean), false)
  if (hits.length) found.push({ ...hits[0], object: element.mesh, faceIndex: 0 })
}

export function registerElements() {
  Object.assign(types, defineElements())
  register(types.text, TEXT, { title: "Minecraft Title Text", icon: "text_fields", name: "text" })
  register(types.shape, SHAPE, { title: "Minecraft Title Shape", icon: "interests", name: "shape" })
}

export function unregisterElements() {
  for (const id of [TEXT, SHAPE]) delete OutlinerElement.types[id]
}
