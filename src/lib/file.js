import { ref } from "vue"
import { keptObject, runtime, scene, titleFileName, validSelection } from "./scene.js"
import { LAYER, LINE, createObject, defaultBorder, defaultDepth, defaultSpacing, defaultTexture, snapshot, typeDefaults } from "./settings.js"
import { submitStats } from "./stats.js"
import { download } from "./ui.js"

const FORMAT = "minecraft-title"
const VERSION = 1
export const EXTENSION = "mctitle"

const UNUSED = [
  [object => object.textureSource !== "premade", ["texture", "textureVariant"]],
  [object => object.textureSource !== "tileable", ["tileable", "tileableVariant", "tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges"]],
  [object => object.textureSource !== "gradient", ["stops", "smooth", "gradientAngle"]],
  [object => object.textureSource === "premade", ["disableFontOverlay"]],
  [object => object.overlayMode !== "custom", ["overlays"]],
  [object => object.edgeOverlayMode !== "custom", ["edgeOverlays"]],
  [object => !object.fade, ["outerFade"]],
  [object => !object.customEdge, ["edgeColour"]],
  [object => !object.customBorder, ["borderColour"]],
  [object => !object.internalFaces, ["fadeInternal", "internalFade", "customInternal", "internalColour", "internalBrightness"]],
  [object => !object.fadeInternal, ["internalFade"]],
  [object => !object.customInternal, ["internalColour"]],
  [object => !object.sideFaces, ["fadeSides", "sideFade", "customSide", "sideColour", "sideBrightness"]],
  [object => !object.fadeSides, ["sideFade"]],
  [object => !object.customSide, ["sideColour"]],
  [object => object.arcMode !== "move", ["arcMove"]],
  [object => object.arcMode === "move", ["arcTop", "arcBottom", "arcMarked", "arcGradient"]],
  [object => object.wordArcMode !== "move", ["wordArcMove"]],
  [object => object.wordArcMode === "move", ["wordArcTop", "wordArcBottom", "wordArcMarked"]]
]

const LAYERS = ["overlays", "edgeOverlays"]

export const fileError = ref(null)

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function trimLayer(layer) {
  return Object.fromEntries(Object.entries(layer).filter(([key, value]) => !same(value, LAYER[key])))
}

function trim(object) {
  const base = { ...typeDefaults(object.type), type: "top" }
  const unused = new Set(UNUSED.filter(([skip]) => skip(object)).flatMap(([, keys]) => keys))
  const values = {}
  for (const [key, value] of Object.entries(snapshot(object))) {
    if (key === "group" || unused.has(key) || same(value, base[key])) continue
    values[key] = LAYERS.includes(key) ? value.map(trimLayer) : value
  }
  return values
}

function split(values, line) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => LINE.has(key) === line))
}

function lines() {
  const list = []
  for (const object of scene.objects) {
    const last = list[list.length - 1]
    if (object.group !== null && last?.[0].group === object.group) last.push(object)
    else list.push([object])
  }
  return list
}

function trimLine(words) {
  if (words.length === 1) return trim(words[0])
  return { ...split(trim(words[0]), true), words: words.map(word => split(trim(word), false)) }
}

function expand(values) {
  const object = { ...typeDefaults(values.type ?? "top"), ...values }
  for (const key of LAYERS) {
    if (values[key]) object[key] = values[key].map(layer => ({ ...LAYER, ...layer }))
  }
  return object
}

function expandLine({ words, ...line }, group) {
  if (!words) return [expand(line)]
  if (!Array.isArray(words) || !words.length) throw new Error("a line has no words in it")
  return words.map(word => expand({ ...line, ...word, group }))
}

export function saveTitle() {
  submitStats()
  const list = lines()
  const numbers = new Map(list.flatMap((words, index) => words.map(word => [word.id, index])))
  const data = { format: FORMAT, version: VERSION, lines: list.map(words => {
    const line = trimLine(words)
    if ("matchWidth" in line) line.matchWidth = numbers.get(line.matchWidth)
    return line
  }) }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
  download(`${titleFileName()}.${EXTENSION}`, url)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  fileError.value = null
}

function parse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function matchLoops(lines, start) {
  const seen = new Set()
  for (let index = start; index !== undefined; index = lines[index].matchWidth) {
    if (seen.has(index)) return true
    seen.add(index)
  }
  return false
}

function readTitle(text) {
  const data = parse(text)
  if (data?.format !== FORMAT) throw new Error("this isn't a Minecraft title file")
  if (data.version > VERSION) throw new Error(`it was saved by a newer version of the generator (format ${data.version})`)
  if (!Array.isArray(data.lines) || !data.lines.length) throw new Error("it has no text in it")
  for (const line of data.lines) {
    if (line.matchWidth !== undefined && !data.lines[line.matchWidth]) throw new Error(`a line matches the width of line ${line.matchWidth}, which doesn't exist`)
  }
  data.lines.forEach((line, index) => {
    if (matchLoops(data.lines, index)) throw new Error(`line ${index} matches its own width`)
  })
  return data.lines.map((line, index) => expandLine(line, index + 1))
}

export function isDefaultTitle() {
  if (scene.objects.length !== 1) return false
  const object = scene.objects[0]
  const { list, font } = runtime[object.id] ?? {}
  if (!list || !font) return false
  const reference = { ...typeDefaults("top"), texture: defaultTexture(list, "top"), spacing: defaultSpacing("top", font), depth: defaultDepth(font), border: defaultBorder("top", font) }
  return same(trim(object), trim(reference))
}

export function resetTitle() {
  const objects = [createObject()]
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
  fileError.value = null
}

export async function openTitle(file, allow = () => true) {
  try {
    const values = readTitle(await file.text())
    if (!allow()) return
    const lines = values.map(words => words.map(value => keptObject(value)))
    const objects = lines.flat()
    for (const object of objects) {
      if (object.matchWidth !== null) object.matchWidth = lines[object.matchWidth][0].id
    }
    scene.objects.splice(0, scene.objects.length, ...objects)
    Object.assign(scene, validSelection(objects, null, null))
    fileError.value = null
  } catch (err) {
    fileError.value = `Couldn't open ${file.name}: ${err.message}`
  }
}
