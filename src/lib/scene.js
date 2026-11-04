import { computed, reactive, ref, shallowReactive, watch } from "vue"
import { round } from "./maths.js"
import { LINE, applyType, createObject, isModified, snapshot } from "./settings.js"
import { view } from "./view.js"

const STORAGE = "minecraft-title-scene"
const FILE_NAME_LIMIT = 64

export const keepTexture = new WeakSet()

export const loadedFont = new WeakMap()

export function keptObject(values, id) {
  const object = createObject(values, id)
  keepTexture.add(object)
  return object
}

export function validSelection(objects, selected, selectedGroup) {
  return {
    selected: objects.some(object => object.id === selected) ? selected : objects[0]?.id ?? null,
    selectedGroup: objects.some(object => object.group !== null && object.group === selectedGroup) ? selectedGroup : null
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE))
    if (Array.isArray(saved?.objects) && saved.objects.some(values => values.text.trim())) return { objects: saved.objects.map(values => keptObject(values, values.id)), selected: saved.selected, selectedGroup: saved.selectedGroup }
  } catch {}
  return { objects: [createObject()], selected: null, selectedGroup: null }
}

const initial = load()

export const scene = reactive({ objects: initial.objects, ...validSelection(initial.objects, initial.selected, initial.selectedGroup) })

export const runtime = shallowReactive({})

export const library = shallowReactive({ fonts: [], tileables: {} })

export const saveError = ref(null)

let saving = null

watch(scene, () => {
  clearTimeout(saving)
  saving = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ objects: scene.objects, selected: scene.selected, selectedGroup: scene.selectedGroup }))
      saveError.value = null
    } catch (err) {
      saveError.value = `Your title couldn't be saved, so changes will be lost if you reload: ${err.message}`
    }
  }, 300)
}, { deep: true })

export function words(object) {
  return object.group === null ? [object] : scene.objects.filter(other => other.group === object.group)
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

export function lineText(object) {
  return words(object).map((word, index) => (index && word.spaceBefore ? " " : "") + word.text.trim()).join("").trim()
}

export function titleFileName() {
  let text = ""
  let group = null
  for (const word of scene.objects) {
    if (word.hidden) continue
    text += (word.group !== null && word.group === group && !word.spaceBefore ? "" : " ") + word.text.trim()
    group = word.group
  }
  const name = text.toLowerCase().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^[_.]+|[_.]+$/g, "")
  return Array.from(name).slice(0, FILE_NAME_LIMIT).join("").replace(/[_.]+$/, "") || "title"
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

function broadcast(object, targets) {
  const wrappers = new WeakMap()
  function read(target, prop, key) {
    if (Array.isArray(target) && typeof Array.prototype[prop] === "function") return Array.prototype[prop]
    if (typeof prop === "symbol") return Reflect.get(target, prop)
    if (prop.startsWith("__v_")) return undefined
    return wrap(Reflect.get(target, prop), key)
  }
  function sync(key) {
    for (const other of targets(key)) {
      if (other !== object) other[key] = clone(object[key])
    }
  }
  function wrap(value, key) {
    if (value === null || typeof value !== "object") return value
    if (!wrappers.has(value)) {
      wrappers.set(value, new Proxy(value, {
        get: (target, prop) => read(target, prop, key),
        set: (target, prop, next) => {
          Reflect.set(target, prop, clone(next))
          sync(key)
          return true
        },
        deleteProperty: (target, prop) => {
          Reflect.deleteProperty(target, prop)
          sync(key)
          return true
        }
      }))
    }
    return wrappers.get(value)
  }
  return new Proxy(object, {
    get: (target, prop) => read(target, prop, prop),
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

export const wordTabs = computed(() => !!currentWord.value && (words(currentWord.value).length > 1 || ["wordGeometry", "wordArc", "wordTransform"].some(panel => isModified(currentWord.value, panel))))

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

export function addObject() {
  const object = createObject({ text: "text" })
  if (scene.objects.length === 1 && scene.objects[0].type === "top") {
    object.type = "bottom"
    applyType(object, "bottom")
  }
  scene.objects.push(object)
  select(object)
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
  scene.objects = scene.objects.filter(object => !ids.has(object.id))
  for (const other of scene.objects) {
    if (ids.has(other.matchWidth)) other.matchWidth = null
  }
  for (const id of ids) delete runtime[id]
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
