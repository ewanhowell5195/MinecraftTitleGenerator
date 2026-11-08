import { ref } from "vue"
import { matchSolved } from "./match.js"
import { keptObject, runtime, scene, titleFileName, validSelection } from "./scene.js"
import { CUSTOM_FONT_KINDS, FILE_VERSION, LAYER, LINE, OVERLAY_KINDS, createObject, defaultBorder, defaultDepth, defaultSpacing, defaultTexture, isCustomFont, snapshot, typeDefaults } from "./settings.js"
import { submitStats } from "./stats.js"
import { downloadBlob } from "./ui.js"

const FORMAT = "minecraft-title"
export const EXTENSION = "mctitle"

const UNUSED = [
  [object => object.textureSource !== "premade", ["texture", "textureVariant"]],
  [object => object.textureSource !== "tileable", ["tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion"]],
  [object => object.textureSource !== "tileable" && !(object.textureSource === "custom" && object.customTextureMode === "tileable"), ["tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges", "tileablePerCharacter"]],
  [object => object.textureSource !== "custom", ["customTexture", "customTextureMode"]],
  [object => !isCustomFont(object.font), ["customFont"]],
  [object => object.tileableSource !== "minecraft", ["minecraftTexture", "minecraftVersion"]],
  [object => object.tileableSource === "minecraft", ["tileable", "tileableVariant"]],
  [object => object.textureSource !== "gradient", ["stops", "smooth", "gradientAngle"]],
  [object => object.textureSource === "premade", ["disableFontOverlay"]],
  [object => object.matchWidth === null, ["matchBottom"]],
  [object => object.overlayMode !== "custom", ["overlays"]],
  [object => object.edgeOverlayMode !== "custom", ["edgeOverlays"]],
  [object => !object.fade, ["outerFade"]],
  [object => !object.customEdge, ["edgeColour", "edgeFill", "edgeStops", "edgeSmooth"]],
  [object => object.edgeFill !== "gradient", ["edgeStops", "edgeSmooth"]],
  [object => object.edgeFill === "gradient", ["edgeColour"]],
  [object => !object.customBorder, ["borderColour"]],
  [object => !object.internalFaces, ["fadeInternal", "internalFade", "customInternal", "internalColour", "internalBrightness", "internalFill", "internalStops", "internalSmooth", "internalDirection"]],
  [object => !object.fadeInternal, ["internalFade"]],
  [object => !object.customInternal, ["internalColour", "internalFill", "internalStops", "internalSmooth", "internalDirection"]],
  [object => object.internalFill !== "gradient", ["internalStops", "internalSmooth", "internalDirection"]],
  [object => object.internalFill === "gradient", ["internalColour"]],
  [object => !object.sideFaces, ["fadeSides", "sideFade", "customSide", "sideColour", "sideBrightness", "sideFill", "sideStops", "sideSmooth", "sideDirection"]],
  [object => !object.fadeSides, ["sideFade"]],
  [object => !object.customSide, ["sideColour", "sideFill", "sideStops", "sideSmooth", "sideDirection"]],
  [object => object.sideFill !== "gradient", ["sideStops", "sideSmooth", "sideDirection"]],
  [object => object.sideFill === "gradient", ["sideColour"]],
  [object => object.arcMode !== "move", ["arcMove"]],
  [object => object.arcMode === "move", ["arcTop", "arcBottom", "arcMarked", "arcGradient"]],
  [object => object.wordArcMode !== "move", ["wordArcMove"]],
  [object => object.wordArcMode === "move", ["wordArcTop", "wordArcBottom", "wordArcMarked"]],
  [object => !object.twistRibbon, ["twistRibbonCentre", "twistRibbonMirror"]],
  [object => !object.twistDoor, ["twistDoorCentre", "twistDoorSame"]],
  [object => matchSolved(object), ["matchScale", "matchOffset"]],
  [object => object.matchWidth === null, ["matchScaleY"]]
]

const LAYERS = Object.keys(OVERLAY_KINDS)

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

function expandLayer(layer) {
  if (layer.file && !layer.file.startsWith("data:image/")) throw new Error("it has an overlay image that isn't embedded in it")
  return { ...LAYER, ...layer }
}

const TWIST_ANCHORS = [["twistRibbonAnchor", "twistRibbonCentre", "twistRibbonMirror"], ["twistDoorAnchor", "twistDoorCentre", "twistDoorSame"]]
const ANCHOR_CENTRES = { left: 0, centre: 50, right: 100 }

function twistCentres(values) {
  const converted = { ...values }
  for (const [anchor, centre, same] of TWIST_ANCHORS) {
    if (!(anchor in converted)) continue
    converted[centre] ??= ANCHOR_CENTRES[converted[anchor]] ?? 50
    if (converted[anchor] === "right") converted[same] = true
    delete converted[anchor]
  }
  return converted
}

function expand(values) {
  if (values.customTexture && !values.customTexture.startsWith("data:image/")) throw new Error("it has a texture image that isn't embedded in it")
  if (values.customFont && (!CUSTOM_FONT_KINDS.includes(values.customFont.kind) || !values.customFont.data?.startsWith?.("data:"))) throw new Error("it has a custom font that isn't embedded in it")
  const object = { ...typeDefaults(values.type ?? "top"), ...twistCentres(values) }
  for (const key of LAYERS) {
    if (values[key]) object[key] = values[key].map(expandLayer)
  }
  return object
}

function expandLine({ words, ...line }, group) {
  if (!words) return [expand(line)]
  if (!Array.isArray(words) || !words.length) throw new Error("a line has no words in it")
  if (words.some(word => "matchWidth" in word)) throw new Error("a word sets matchWidth, which only a line can have")
  return words.map(word => expand({ ...line, ...word, group }))
}

export function titleData() {
  const list = lines()
  const numbers = new Map(list.flatMap((words, index) => words.map(word => [word.id, index])))
  return { format: FORMAT, version: FILE_VERSION, lines: list.map(words => {
    const line = trimLine(words)
    if ("matchWidth" in line) line.matchWidth = numbers.get(line.matchWidth)
    return line
  }) }
}

export function saveTitle() {
  if (!scene.objects.length) return
  submitStats()
  downloadBlob(`${titleFileName()}.${EXTENSION}`, new Blob([JSON.stringify(titleData(), null, 2)], { type: "application/json" }))
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
  return readData(data)
}

function restartTilesPerCharacter(entry) {
  return entry.textureSource === "tileable" ? { tileablePerCharacter: true, ...entry } : entry
}

function separateMatchScale(line) {
  if (line.matchWidth === undefined || line.matchWidth === null) return line
  const { scaleX, linkScale, ...upgraded } = line
  if (scaleX !== undefined) upgraded.matchScale = scaleX
  if (linkScale === undefined || linkScale === null) return upgraded
  return { ...upgraded, matchScaleY: true, scaleY: linkScale }
}

function widenBlockSerif(line) {
  if (line.font !== "block-serif") return line
  return { ...line, spacing: (line.spacing ?? typeDefaults(line.type ?? "top").spacing) + 2 }
}

function anchorDepthAtFront(line) {
  if ((line.type ?? "top") === "bottom" || "depthAnchor" in line) return line
  const deepened = "depth" in line || "wordDepth" in line || Array.isArray(line.words) && line.words.some(word => "wordDepth" in word)
  return deepened ? { ...line, depthAnchor: "front" } : line
}

function restartLineTiles(line) {
  const restarted = restartTilesPerCharacter(line)
  return Array.isArray(line.words) ? { ...restarted, words: line.words.map(restartTilesPerCharacter) } : restarted
}

const UPGRADES = [[2, restartLineTiles], [3, separateMatchScale], [4, widenBlockSerif], [5, anchorDepthAtFront]]

function upgradeLine(line, version) {
  return UPGRADES.reduce((upgraded, [to, upgrade]) => version < to ? upgrade(upgraded) : upgraded, line)
}

function readData(data) {
  if (data.version > FILE_VERSION) throw new Error(`it was saved by a newer version of the generator (format ${data.version})`)
  if (!Array.isArray(data.lines) || !data.lines.length) throw new Error("it has no text in it")
  const lines = data.lines.map(line => upgradeLine(line, data.version ?? 0))
  for (const line of lines) {
    if (line.matchWidth !== undefined && !lines[line.matchWidth]) throw new Error(`a line matches the width of line ${line.matchWidth}, which doesn't exist`)
  }
  for (const index of lines.keys()) {
    if (matchLoops(lines, index)) throw new Error(`line ${index} matches its own width`)
  }
  return lines.map((line, index) => expandLine(line, index + 1))
}

export function isDefaultTitle() {
  if (scene.objects.length !== 1) return false
  const object = scene.objects[0]
  const { list, font } = runtime[object.id] ?? {}
  if (!list || !font) return false
  const reference = { ...typeDefaults("top"), texture: defaultTexture(list, "top"), spacing: defaultSpacing("top", font), depth: defaultDepth(font), border: defaultBorder("top", font) }
  return same(trim(object), trim(reference))
}

function showObjects(objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
  fileError.value = null
}

export function resetTitle() {
  showObjects([createObject()])
}

function titleObjects(values) {
  const lines = values.map(words => words.map(value => keptObject(value)))
  const objects = lines.flat()
  for (const object of objects) {
    if (object.matchWidth !== null) object.matchWidth = lines[object.matchWidth][0].id
  }
  return objects
}

export function readTitleObjects(data) {
  return titleObjects(readData(data))
}

export function openTitleData(data) {
  showObjects(readTitleObjects(data))
}

export async function openTitle(file, allow = () => true) {
  try {
    const values = readTitle(await file.text())
    if (!allow()) return
    showObjects(titleObjects(values))
  } catch (err) {
    fileError.value = `Couldn't open ${file.name}: ${err.message}`
  }
}
