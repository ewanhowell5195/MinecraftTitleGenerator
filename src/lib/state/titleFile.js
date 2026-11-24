import { fontTextures } from "../texture/assets.js"
import { cameraChanges, setCamera } from "../settings/camera.js"
import { defaultBorder, defaultDepth, defaultSpacing, fontFaces, typeDefaults } from "../settings/defaults.js"
import { loadFont, loadFontList } from "../font/font.js"
import { readTitleObjects, titleObjects } from "../title/objects.js"
import { EXTENSION, fileData, readTitle, trimUnused } from "../title/titleData.js"
import { fileError } from "./notices.js"
import { createObject } from "../settings/objects.js"
import { editorTitle, lines, presetSource, runtime, scene, titleFileName, validSelection } from "./scene.js"
import { isCustomFont } from "../settings/settings.js"
import { defaultTexture } from "../settings/textureDefaults.js"
import { sameValue } from "../core/values.js"
import { submitStats } from "./stats.js"
import { downloadBlob } from "../core/files.js"
import { resetTabs, titleLoads } from "./view.js"

function trim(object) {
  return trimUnused(object, editorTitle)
}

function sameSettings(a, b) {
  return Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).every(key => sameValue(a[key], b[key]))
}

export function titleData() {
  return fileData(lines(), scene.camera, trim)
}

export function saveTitle() {
  if (!scene.objects.length) return
  submitStats()
  const data = { ...titleData(), ...(scene.preset && { preset: scene.preset }) }
  downloadBlob(`${titleFileName()}.${EXTENSION}`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
  fileError.value = null
}

function titleReference(list, font) {
  return { ...typeDefaults("top"), texture: defaultTexture(list, "top"), spacing: defaultSpacing("top", font), depth: defaultDepth(font), border: defaultBorder("top", font), ...fontFaces("top", font) }
}

function defaultCamera() {
  return !Object.keys(cameraChanges(scene.camera)).length
}

export function isDefaultTitle() {
  if (scene.objects.length !== 1 || !defaultCamera()) return false
  const object = scene.objects[0]
  const { list, font } = runtime[object.id] ?? {}
  if (!list || !font) return false
  return sameSettings(trim(object), trim(titleReference(list, font)))
}

export async function untouchedTitle() {
  if (scene.objects.length !== 1 || !defaultCamera()) return false
  if (isDefaultTitle()) return true
  const object = scene.objects[0]
  if (object.shape !== null || isCustomFont(object.font)) return false
  const fonts = await loadFontList()
  const entry = fonts.find(item => item.id === object.font)
  if (!entry) return false
  const font = await loadFont(entry, fonts)
  return sameSettings(trim(object), trim(titleReference(await fontTextures(font.sheetFolder, font.strips), font)))
}

function showObjects(objects, camera, preset = null) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  setCamera(scene.camera, camera)
  scene.preset = preset
  Object.assign(scene, validSelection(objects, null, null))
  fileError.value = null
  titleLoads.value++
}

export function resetTitle() {
  resetTabs()
  showObjects([createObject()])
}

export function openTitleData(data) {
  showObjects(readTitleObjects(data), data.camera)
}

export function openTitleText(text) {
  const { values, camera, preset } = readTitle(text)
  showObjects(titleObjects(values), camera, presetSource(preset))
}

export async function openTitle(file, allow = () => true) {
  try {
    const { values, camera, preset } = readTitle(await file.text())
    if (!await allow()) return
    showObjects(titleObjects(values), camera, presetSource(preset))
  } catch (err) {
    fileError.value = `Couldn't open ${file.name}: ${err.message}`
  }
}
