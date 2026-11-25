import { fontTextures } from "../texture/assets.js"
import { setCamera } from "../settings/camera.js"
import { loadFont, loadFontList } from "../font/font.js"
import { readTitleObjects, titleObjects } from "../title/objects.js"
import { hasDefaultSettings, isDefaultCamera, isDefaultTitle as isDefault } from "../title/defaultTitle.js"
import { EXTENSION, fileData, readTitle, trimUnused } from "../title/titleData.js"
import { fileError } from "./notices.js"
import { createObject } from "../settings/objects.js"
import { editorTitle, lines, presetSource, scene, titleFileName, validSelection } from "./scene.js"
import { isCustomFont } from "../settings/settings.js"
import { submitStats } from "./stats.js"
import { downloadBlob } from "../core/files.js"
import { resetTabs, titleLoads } from "./view.js"

function trim(object) {
  return trimUnused(object, editorTitle)
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

export function isDefaultTitle() {
  return isDefault(editorTitle)
}

export async function untouchedTitle() {
  if (scene.objects.length !== 1 || !isDefaultCamera(scene)) return false
  if (isDefaultTitle()) return true
  const object = scene.objects[0]
  if (object.shape !== null || isCustomFont(object.font)) return false
  const fonts = await loadFontList()
  const entry = fonts.find(item => item.id === object.font)
  if (!entry) return false
  const font = await loadFont(entry, fonts)
  return hasDefaultSettings(object, editorTitle, await fontTextures(font.sheetFolder, font.strips), font)
}

function showObjects(objects, camera, preset = null) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  setCamera(scene.camera, camera)
  scene.preset = preset
  Object.assign(scene, validSelection(objects, null, null))
  resetTabs()
  fileError.value = null
  titleLoads.value++
}

export function resetTitle() {
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
