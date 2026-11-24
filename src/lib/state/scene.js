import { computed, reactive, ref, shallowReactive, toRaw, watch } from "vue"
import { cameraChanges, fullCamera } from "../settings/camera.js"
import { applyType } from "../settings/defaults.js"
import { hoisted, lowered } from "../link/linkformat.js"
import { round } from "../core/maths.js"
import { createObject } from "../settings/objects.js"
import { framing, useFraming } from "../../render/framing.js"
import { LINE, isModified, snapshot } from "../settings/settings.js"
import { plainCopy } from "../core/values.js"
import { shapeName } from "../geometry/shapes.js"
import { keptObject, titleObjects } from "../title/objects.js"
import { createTitle, freeRowOf, linesOf, wordsOf } from "../title/title.js"
import { joinWords, titleLines, titleValues, trimmed } from "../link/titleLines.js"
import { FILE_VERSION } from "../settings/upgrades.js"
import { userBusy } from "./activity.js"
import { readStored, view, viewport } from "./view.js"
import { readLarge, removeLarge, writeLarge } from "./largeStore.js"
import { trackEach } from "./tracking.js"

const STORAGE = "minecraft-title-scene"
const LARGE = "large"
const UNVERSIONED = 4

export function validSelection(objects, selected, selectedGroup) {
  return {
    selected: objects.some(object => object.id === selected) ? selected : objects[0]?.id ?? null,
    selectedGroup: objects.some(object => object.group !== null && object.group === selectedGroup) ? selectedGroup : null
  }
}

export function lines() {
  return linesOf(scene.objects)
}

export function presetSource(value) {
  return Number.isInteger(value?.id) && typeof value.name === "string" ? { id: value.id, name: value.name } : null
}

function stored(objects, { selected, selectedGroup, camera, preset = null }, version, values) {
  const list = linesOf(objects)
  const group = list.findIndex(line => line[0].group !== null && line[0].group === selectedGroup)
  const changes = cameraChanges(camera)
  return { version, lines: titleLines(list, values).map(hoisted), ...(Object.keys(changes).length && { camera: changes }), selected: objects.findIndex(object => object.id === selected), selectedGroup: group < 0 ? null : group, ...(preset && { preset }) }
}

function unversioned(saved) {
  return stored(saved.objects.map(values => ({ ...values, group: values.group ?? null })), saved, UNVERSIONED, ({ id, group, ...values }) => values)
}

function fresh(error = null) {
  return { objects: [createObject()], selected: null, selectedGroup: null, preset: null, error }
}

async function savedTitle() {
  const saved = readStored(STORAGE)
  if (saved?.saved !== LARGE) return saved
  return JSON.parse(await readLarge(STORAGE) ?? "null")
}

async function load() {
  try {
    const saved = await savedTitle()
    const data = Array.isArray(saved?.objects) ? unversioned(saved) : saved
    if (!data?.lines?.length) return fresh()
    const objects = titleObjects(titleValues({ ...data, lines: data.lines.map(lowered) }))
    if (!objects.some(object => object.shape !== null || object.text.trim())) return fresh()
    return { objects, camera: data.camera, selected: objects[data.selected]?.id ?? null, selectedGroup: linesOf(objects)[data.selectedGroup]?.[0].group ?? null, preset: presetSource(data.preset), error: null }
  } catch (err) {
    return fresh(err.message)
  }
}

useFraming({ view, viewport })

const initial = await load()

export const scene = reactive({ objects: initial.objects, camera: fullCamera(initial.camera), preset: initial.preset, ...validSelection(initial.objects, initial.selected, initial.selectedGroup) })

export const editorTitle = {
  ...createTitle(scene.objects, view, scene.camera),
  framing,
  busy: userBusy,
  get objects() {
    return scene.objects
  }
}

export const runtime = editorTitle.runtime

export const library = shallowReactive({ fonts: [], shapes: [], tileables: {} })

export const saveError = ref(initial.error && `Your last title couldn't be restored: ${initial.error}`)

export const TITLE_PARAM = "title"
export const PRESET_PARAM = "preset"

export const sharedLink = { open: false, preset: null }

let saving = null
let saves = 0
let large = readStored(STORAGE)?.saved === LARGE

function failed(err) {
  saveError.value = `Your title couldn't be saved, so changes will be lost if you reload: ${err.message}`
}

async function saveLarge(text, save) {
  try {
    await writeLarge(STORAGE, text)
    if (save !== saves) return
    localStorage.setItem(STORAGE, JSON.stringify({ saved: LARGE }))
    large = true
    saveError.value = null
  } catch (err) {
    if (save === saves) failed(err)
  }
}

function save(text) {
  const current = ++saves
  try {
    localStorage.setItem(STORAGE, text)
  } catch (err) {
    if (err.name === "QuotaExceededError") saveLarge(text, current)
    else failed(err)
    return
  }
  saveError.value = null
  if (!large) return
  large = false
  removeLarge(STORAGE).catch(failed)
}

export function replaceAddress(url) {
  // vue-router puts its state's current address back when it next moves on
  history.replaceState(history.state && { ...history.state, current: `${url.pathname}${url.search}${url.hash}` }, "", url)
}

export function clearSharedLink() {
  const url = new URL(location.href)
  url.searchParams.delete(TITLE_PARAM)
  url.searchParams.delete(PRESET_PARAM)
  replaceAddress(url)
}

export function leaveSharedLink() {
  if (!sharedLink.open && sharedLink.preset === null) return
  Object.assign(sharedLink, { open: false, preset: null })
  clearSharedLink()
}

const trims = new WeakMap()

function savedValues(object) {
  const raw = toRaw(object)
  if (!trims.has(raw)) trims.set(raw, trimmed(object))
  return { ...trims.get(raw) }
}

function queueSave() {
  clearTimeout(saving)
  saving = setTimeout(() => {
    if (sharedLink.open) return
    save(JSON.stringify(stored(scene.objects, scene, FILE_VERSION, savedValues)))
  }, 300)
}

trackEach(() => scene.objects, raw => {
  if (raw) trims.delete(raw)
  queueSave()
})
trackEach(() => [scene.camera], queueSave)
watch(() => [scene.selected, scene.selectedGroup, scene.preset], queueSave)

export function words(object) {
  return wordsOf(object, editorTitle)
}

export function gameVersions(browsing = null) {
  return new Set(scene.objects.flatMap(object => [object.shapeVersion, object.minecraftVersion]).concat(browsing).filter(Boolean))
}

export function lineHidden(object) {
  return words(object).every(word => word.hidden)
}

export function toggleLine(object) {
  const hide = !lineHidden(object)
  for (const word of words(object)) word.hidden = hide
}

export function setScale(object, key, value) {
  object[key] = value
  const [link, x, y] = key.startsWith("word") ? ["wordLinkScale", "wordScaleX", "wordScaleY"] : ["linkScale", "scaleX", "scaleY"]
  if (object[link] === null || !Number.isFinite(value)) return
  if (key === x) object[y] = round(value * object[link], 4)
  if (key === y) object[x] = round(value / object[link], 4)
}

export function chooseMatch(object, id) {
  for (const word of words(object)) {
    word.matchWidth = id
    if (id === null) continue
    word.translateX = 0
    setScale(word, "scaleX", 1)
    if (!word.matchScaleY) continue
    word.scaleY = 1
    if (word.linkScale !== null) word.linkScale = 1
  }
}

function bakeWord(word) {
  const scaleX = round(word.scaleX * word.matchScale, 4)
  const scaleY = word.matchScaleY ? round(word.scaleY * word.matchScale, 4) : word.scaleY
  Object.assign(word, { scaleX, scaleY, linkScale: word.linkScale === null ? null : scaleY / scaleX, translateX: round(word.translateX + word.matchOffset, 2), matchWidth: null, matchBottom: true, matchScaleY: false, matchScale: 1, matchOffset: 0 })
}

export function bakeMatch(object) {
  words(object).forEach(bakeWord)
}

export function wordText(word) {
  if (word.shape === null) return word.text.trim()
  return shapeName(library.shapes, word.shape)
}

export function lineText(object) {
  return joinWords(words(object), wordText)
}

export function titleText() {
  return lines().map(line => joinWords(line.filter(word => !word.hidden && word.shape === null), wordText)).filter(Boolean).join(" ")
}

export function casedTitle() {
  return lines().some(line => line.some(word => !word.hidden && word.shape === null && runtime[word.id]?.font?.multicase))
}

export function fileNameOf(text, fallback) {
  const name = text.toLowerCase().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^[_.]+|[_.]+$/g, "")
  return Array.from(name).slice(0, 64).join("").replace(/[_.]+$/, "") || fallback
}

export function titleFileName() {
  return fileNameOf(titleText(), "title")
}

function clone(value) {
  return plainCopy(value)
}

function broadcast(object, targets) {
  const wrappers = new WeakMap()
  function within(path, prop) {
    return path[0] === "layerSettings" && path.length < 3 ? path.concat(prop) : path
  }
  function read(target, prop, path) {
    if (Array.isArray(target) && typeof Array.prototype[prop] === "function") return Array.prototype[prop]
    if (typeof prop === "symbol") return Reflect.get(target, prop)
    if (prop.startsWith("__v_")) return undefined
    return wrap(Reflect.get(target, prop), path)
  }
  function sync([key, layer, name]) {
    for (const other of targets(key)) {
      if (other === object) continue
      if (name === undefined) other[key] = clone(object[key])
      else if (other[key][layer]) other[key][layer][name] = clone(object[key][layer][name])
    }
  }
  function wrap(value, path) {
    if (value === null || typeof value !== "object") return value
    if (!wrappers.has(value)) {
      wrappers.set(value, new Proxy(value, {
        get: (target, prop) => read(target, prop, within(path, prop)),
        set: (target, prop, next) => {
          Reflect.set(target, prop, clone(next))
          sync(within(path, prop))
          return true
        },
        deleteProperty: (target, prop) => {
          Reflect.deleteProperty(target, prop)
          sync(within(path, prop))
          return true
        }
      }))
    }
    return wrappers.get(value)
  }
  return new Proxy(object, {
    get: (target, prop) => read(target, prop, [prop]),
    set: (target, prop, next) => {
      const value = clone(next)
      for (const other of targets(prop)) other[prop] = other === object ? value : clone(value)
      return true
    }
  })
}

export const currentWord = computed(() => scene.objects.find(object => object.id === scene.selected) ?? scene.objects[0])

export const selection = computed(() => {
  if (!currentWord.value) return []
  return scene.selectedGroup === null ? [currentWord.value] : scene.objects.filter(object => object.group === scene.selectedGroup)
})

export const current = computed(() => {
  const object = currentWord.value
  if (!object || object.group === null) return object
  if (scene.selectedGroup === object.group) return broadcast(object, key => key === "text" ? [object] : words(object))
  return broadcast(object, key => LINE.has(key) ? words(object) : [object])
})

export const wordTabs = computed(() => !!currentWord.value && (words(currentWord.value).length > 1 || ["wordGeometry", "wordArc", "wordRibbon", "wordWrap", "wordFan", "wordTransform"].some(panel => isModified(currentWord.value, panel))))

export const shapingWord = computed(() => wordTabs.value && view.shapeTab === "word")

export const active = computed(() => currentWord.value && runtime[currentWord.value.id] || {})

export function select(object) {
  scene.selected = object.id
  scene.selectedGroup = null
}

export function selectGroup(group) {
  scene.selected = scene.objects.find(object => object.group === group).id
  scene.selectedGroup = group
}

let lastTyped = null

export function noteType(object) {
  lastTyped = { id: object.id, type: object.type }
}

function nextType() {
  if (!scene.objects.length) return "top"
  return scene.objects.some(object => object.id === lastTyped?.id) ? lastTyped.type : scene.objects.at(-1).type
}

export function freeRow(type, moving = null) {
  return freeRowOf(type, editorTitle, moving ? words(moving) : [])
}

function addNew(object, section) {
  const type = nextType()
  if (type !== object.type) {
    object.type = type
    applyType(object, type)
  }
  object.row = freeRow(type)
  noteType(object)
  scene.objects.push(object)
  select(object)
  view.section = section
}

function selectedValues(keys, wanted) {
  const selected = scene.objects.find(object => object.id === scene.selected)
  if (!selected || !wanted(selected)) return null
  const raw = toRaw(selected)
  return Object.fromEntries(keys.map(key => [key, raw[key]]))
}

export function addObject() {
  addNew(createObject({ text: "text", ...selectedValues(["font", "customFont"], object => object.shape === null) }), "text")
}

export function addShape() {
  addNew(createObject(selectedValues(["shape", "shapeVersion", "blockState", "itemComponents"], object => object.shape !== null) ?? { shape: library.shapes[0].id }), "shape")
}

function nextGroup() {
  return Math.max(0, ...scene.objects.map(object => object.group ?? 0)) + 1
}

export function insertWord(source, values) {
  if (source.group === null) source.group = nextGroup()
  const object = keptObject({ ...snapshot(source), ...values })
  scene.objects.splice(scene.objects.indexOf(source) + 1, 0, object)
  return object
}

export function addWord(source) {
  const list = words(source)
  select(insertWord(list[list.length - 1], { text: "word", spaceBefore: true }))
}

export function duplicateLine(object) {
  const list = words(object)
  const group = object.group === null ? null : nextGroup()
  const objects = list.map(source => keptObject({ ...snapshot(source), group }))
  scene.objects.splice(scene.objects.indexOf(list[list.length - 1]) + 1, 0, ...objects)
  if (group === null) select(objects[0])
  else selectGroup(group)
}

function remove(list) {
  const [first] = list
  const index = scene.objects.indexOf(first)
  const ids = new Set(list.map(object => object.id))
  const siblings = words(first)
  const neighbour = siblings.slice(0, siblings.indexOf(first)).reverse().concat(siblings).find(object => !ids.has(object.id))
  const remaining = siblings.find(object => !ids.has(object.id))
  scene.objects = scene.objects.filter(object => !ids.has(object.id))
  for (const other of scene.objects) {
    if (!ids.has(other.matchWidth)) continue
    if (remaining) other.matchWidth = remaining.id
    else bakeWord(other)
  }
  for (const id of ids) {
    delete runtime[id]
    delete editorTitle.problems[id]
  }
  if (first.group !== null) {
    const left = words(first)
    if (left.length === 1) left[0].group = null
  }
  if (scene.selectedGroup !== null && !scene.objects.some(object => object.group === scene.selectedGroup)) scene.selectedGroup = null
  if (!ids.has(scene.selected)) return
  if (!scene.objects.length) scene.selected = null
  else if (scene.selectedGroup === null) select(neighbour ?? scene.objects[Math.min(index, scene.objects.length - 1)])
  else selectGroup(scene.selectedGroup)
}

export function removeObject(object) {
  remove([object])
}

export function removeLine(object) {
  remove(words(object))
}
