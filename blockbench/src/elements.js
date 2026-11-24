import * as THREE from "three"
import { createObject } from "../../src/lib/settings/objects.js"
import { LINE, restore, snapshot } from "../../src/lib/settings/settings.js"
import { FILE_VERSION } from "../../src/lib/settings/upgrades.js"
import { joinWords, titleValues, trimmed } from "../../src/lib/link/titleLines.js"
import { keepTexture } from "../../src/lib/title/objects.js"
import { loadKey, shapeName } from "../../src/lib/geometry/shapes.js"
import { library } from "./library.js"
import { nativePosition, wordOffset, wordTransform } from "./placing.js"
import { attach, detach, homeOf, lineOf, memberOf, refreshList } from "./titles.js"
import { quietly } from "./undo.js"

export const TEXT = "minecraft_title_text"
export const SHAPE = "minecraft_title_shape"
export const WORD = "minecraft_title_word"

// Blockbench only pastes next to an element that could hold what is pasted, so these are let in and moved out by settle in titles.js
const CHILDREN = [WORD, TEXT, SHAPE, "cube", "mesh"]
const COPIED = "copied_words"
const PROPERTIES = [["string", "name", "text"], ["vector", "position"], ["vector", "rotation"], ["vector", "scale", [1, 1, 1]], ["boolean", "visibility", true], ["boolean", "locked", false]]
const SCALES = ["scaleX", "scaleY", "scaleZ"]
const WORD_SCALES = ["wordScaleX", "wordScaleY", "wordScaleZ"]
const WORD_MOVES = ["wordTranslateX", "wordTranslateY", "wordTranslateZ", "wordRotationX", "wordRotationY", "wordRotationZ"]
const UNSAVED = new Set(SCALES.concat("hidden", "matchWidth", "matchScale", "matchOffset"))
const UNSAVED_WORD = new Set(Array.from(UNSAVED).concat(WORD_SCALES, WORD_MOVES))
const LINE_ONLY = new Set(Array.from(LINE).filter(key => key !== "type"))

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
    get line() {
      return null
    }
    get words() {
      return []
    }
    get unsaved() {
      return UNSAVED
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
      super.remove()
      detach(this)
      return this
    }
    extend(data) {
      for (const key in this.constructor.properties) this.constructor.properties[key].merge(this, data)
      const values = data instanceof TitleElement ? snapshot(data.settings) : data.title && titleValues({ version: data.title_version, lines: [data.title] })[0][0]
      if (values) this.useSettings({ ...values, group: this.settings.group, matchWidth: data instanceof TitleElement ? data.settings.matchWidth : data.match_width ?? null })
      if (data.has_words || data instanceof TitleElement && data.words.length) this.temp_data.awaitsWords = true
      if (Array.isArray(data.copied_words)) this.temp_data.copiedWords = data.copied_words
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
    addTo(target, index) {
      if (this.isWord || !(target instanceof TitleText)) return super.addTo(target, index)
      return super.addTo(target.parent, target.getParentArray().indexOf(target) + 1)
    }
    scaleTo(axis, value) {
      this.scale[axis] = value
      this.sendTransform()
    }
    savedSettings() {
      return { title: trimmed(this.settings, this.unsaved), match_width: homeOf(this.settings.matchWidth) }
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
      const body = this.body
      const sizes = body ? body.getSize(new THREE.Vector3()).toArray().map((size, index) => size * this.scale[index]) : [0, 0, 0]
      return axis === undefined ? sizes : sizes[axis]
    }
    get body() {
      return memberOf(this)?.body
    }
    getSize(axis) {
      return this.size(axis)
    }
    resize(value, axis, negative) {
      const scale = this.temp_data.old_scale ??= this.scale.slice()
      let size = this.scale[axis]
      if (typeof value === "function") {
        size = value(size)
        delete this.temp_data.old_scale
      } else {
        const before = this.temp_data.old_size?.[axis]
        if (!before) return this
        size = scale[axis] * (before + (negative ? -value : value)) / before
      }
      this.scaleTo(axis, Math.max(0.05, Math.roundTo(size, 4)))
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
    static behavior = { ...TitleElement.behavior, parent: true, child_types: CHILDREN, select_children: "self_first" }
    children = []
    isOpen = false
    get words() {
      return (this.children ?? []).filter(child => child.isWord)
    }
    get body() {
      return this.words.length ? lineOf(this)?.body : super.body
    }
    describe() {
      return this.words.length ? joinWords(this.words.map(word => word.settings), word => word.text.trim()) : super.describe()
    }
    sendTransform() {
      super.sendTransform()
      for (const word of this.words) {
        for (const key of SCALES) {
          if (word.settings[key] !== this.settings[key]) word.settings[key] = this.settings[key]
        }
        word.sendTransform()
      }
    }
    scaleTo(axis, value) {
      const moves = this.words.map(word => WORD_MOVES.slice(0, 3).map(key => word.settings[key]))
      this.scale[axis] = value
      this.settings[SCALES[axis]] = value
      for (const [index, word] of this.words.entries()) {
        word.settings[SCALES[axis]] = value
        word.position.replace(nativePosition({ ...word.settings, ...Object.fromEntries(moves[index].map((move, at) => [WORD_MOVES[at], move])) }))
      }
      this.sendTransform()
    }
    savedSettings() {
      if (!this.words.length) return super.savedSettings()
      const saved = super.savedSettings()
      return { ...saved, title: { ...Object.fromEntries(Object.entries(saved.title).filter(([key]) => LINE.has(key))), text: "" } }
    }
    savedData() {
      return { ...super.savedData(), has_words: this.words.length > 0 }
    }
    getSaveCopy() {
      return { ...super.getSaveCopy(), ...(this.words.length && { [COPIED]: this.words.map(word => word.getSaveCopy()) }) }
    }
    init() {
      super.init()
      for (const copy of this.temp_data.copiedWords ?? []) new TitleWord(copy).addTo(this).init()
      delete this.temp_data.copiedWords
      return this
    }
    forEachChild(action, type, forSelf) {
      if (forSelf) action(this)
      for (const word of this.words) {
        if (!type || (Array.isArray(type) ? type.some(wanted => word instanceof wanted) : word instanceof type)) action(word)
      }
    }
    openUp() {
      this.isOpen = true
      this.updateElement()
      if (this.parent && this.parent !== "root") this.parent.openUp()
      return this
    }
  }

  class TitleWord extends TitleElement {
    static properties = {}
    static behavior = { ...TitleElement.behavior, parent_types: [TEXT] }
    get isWord() {
      return true
    }
    getTypeBehavior(flag) {
      return flag === "duplicatable" && this.line?.selected ? false : super.getTypeBehavior(flag)
    }
    get line() {
      return this.parent instanceof TitleText ? this.parent : null
    }
    get unsaved() {
      return UNSAVED_WORD
    }
    sendTransform() {
      const { line, scale, settings } = this
      ownMoves(this)
      const values = { ...wordTransform(settings, this.position, this.rotation), ...Object.fromEntries(WORD_SCALES.map((key, axis) => [key, scale[axis]])) }
      for (const [key, value] of Object.entries(values)) {
        if (settings[key] !== value) settings[key] = value
      }
      const hidden = !this.visibility || line?.visibility === false
      if (settings.hidden !== hidden) settings.hidden = hidden
    }
    getSaveCopy() {
      const copy = super.getSaveCopy()
      return { ...copy, title: Object.fromEntries(Object.entries(copy.title).filter(([key]) => !LINE_ONLY.has(key))), match_width: undefined }
    }
  }

  class TitleShape extends TitleElement {
    static properties = {}
    static behavior = { ...TitleElement.behavior }
    startingSettings() {
      return { shape: "heart" }
    }
  }

  return { base: TitleElement, text: TitleText, shape: TitleShape, word: TitleWord }
}

function ownMoves({ position }) {
  if (Object.hasOwn(position, "V3_subtract")) return
  // Blockbench moves the children of a moved element back to where they were through this
  Object.defineProperty(position, "V3_subtract", { configurable: true, value: () => position })
  // Blockbench adds global movement as it is, which only fits children of groups
  Object.defineProperty(position, "V3_add", { configurable: true, value: (...move) => addMove(position, move.flat()) })
}

function addMove(position, move) {
  const word = Outliner.selected.find(element => element.position === position)
  const parent = word?.line?.mesh
  if (!parent || getEditTransformSpace() !== 0) return Array.prototype.V3_add.call(position, ...move)
  const turn = parent.getWorldQuaternion(new THREE.Quaternion()).invert()
  return Array.prototype.V3_add.call(position, ...new THREE.Vector3(...move).applyQuaternion(turn).toArray())
}

function register(type, id, { title, icon, name, actions = [] }) {
  Object.assign(type.prototype, {
    title,
    icon,
    type: id,
    menu: new Menu([...Outliner.control_menu_group, new MenuSeparator("settings"), ...actions, new MenuSeparator("convert"), "convert_minecraft_title_to_cubes", "convert_minecraft_title_to_mesh", new MenuSeparator("manage"), "rename", "toggle_visibility", "delete"]),
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
      mesh.outline = outline
      mesh.add(outline)
      this.updateTransform(element)
      mesh.visible = element.visibility
      this.dispatchEvent("setup", { element })
    },
    updateTransform(element) {
      element.sendTransform()
      const { mesh } = element
      const member = memberOf(element)
      shared.updateTransform.call(this, element)
      mesh.scale.set(1, 1, 1)
      if (element.isWord) {
        mesh.position.set(0, 0, 0)
        if (member?.item?.transform) mesh.position.copy(member.centre).add(wordOffset(member.item, element.settings))
      } else {
        const pivot = element.words.length ? lineOf(element)?.pivot : member?.pivot
        if (pivot) mesh.position.add(pivot)
      }
      if (member && member.entry.group.parent !== mesh) mesh.add(member.entry.group)
      mesh.updateMatrixWorld(true)
    },
    updatePlaced(element) {
      const member = memberOf(element)
      const box = member ? member.box : lineOf(element)?.box
      const { outline } = element.mesh
      this.updateTransform(element)
      outline.geometry.dispose()
      outline.geometry = box ? boxEdges(box) : new THREE.BufferGeometry()
      if (member && box) outline.geometry.applyMatrix4(member.entry.group.matrix)
      if (element.selected) TickUpdates.selection = true
    },
    updateVisibility(element) {
      element.sendTransform()
      shared.updateVisibility.call(this, element)
      for (const word of element.words) word.sendTransform()
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

function dropCopies({ model }) {
  for (const element of model.elements ?? []) delete element[COPIED]
}

export function registerElements() {
  Object.assign(types, defineElements())
  register(types.text, TEXT, { title: "Minecraft Title Text", icon: "text_fields", name: "text", actions: ["add_minecraft_title_word"] })
  register(types.shape, SHAPE, { title: "Minecraft Title Shape", icon: "interests", name: "shape" })
  register(types.word, WORD, { title: "Minecraft Title Word", icon: "match_word", name: "word", actions: ["add_minecraft_title_word"] })
  Codecs.project.on("compile", dropCopies)
}

export function unregisterElements() {
  Codecs.project.removeListener("compile", dropCopies)
  for (const id of [TEXT, SHAPE, WORD]) delete OutlinerElement.types[id]
}
