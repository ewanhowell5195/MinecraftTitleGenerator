import { createRenderer, effectScope, reactive, watch } from "vue"
import * as THREE from "three"
import ObjectRenderer from "../components/ObjectRenderer.js"
import { loadTileables, textureList } from "./assets.js"
import { readTitleObjects } from "./file.js"
import { loadFontList, sheetFolder } from "./font.js"
import { createTitleItems } from "./items.js"
import { decodeTitle, unknownSetting } from "./linkformat.js"
import { keepMatched } from "./match.js"
import { platform } from "./platform.js"
import { renderTitle } from "./render.js"
import { OVERLAY_KINDS, activeOverlays } from "./settings.js"
import { createEntry, destroyEntry, frameCamera, sortEntries, titleFraming, updateEntry } from "./stage.js"
import { createTitle } from "./title.js"
import { DEFAULT_FOV } from "./view.js"

const STAGE_WIDTH = 1000
const STAGE_HEIGHT = 500
// the 1024px cap on the big view in PresetsPage.vue minus its border and padding in PresetDetail.vue and on .large in TitlePicture.vue
const PICTURE_WIDTH = 935
const PICTURE_QUALITY = 0.85
const TIME_LIMIT = 180000
const VIEW = { render: false, fov: DEFAULT_FOV, fixedDistance: false, previews: false }
const NOTHING_RENDERED = createRenderer({ insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {} })

let library = null

function loadLibrary() {
  library ??= Promise.all([loadFontList(), loadTileables()]).catch(err => {
    library = null
    throw err
  })
  return library
}

function refuseUnknownVariant(label, entry, id, variant) {
  if (!entry) throw new Error(`there is no ${label} called ${id}`)
  if (variant && !entry.variants?.[variant]) throw new Error(`the ${label} ${id} has no variant called ${variant}`)
}

async function refuseUnknownNames(object, fonts, tileables) {
  const font = fonts.find(entry => entry.id === object.font)
  if (!font) throw new Error(`there is no font called ${object.font}`)
  const list = await textureList(sheetFolder(font, fonts))
  if (object.textureSource === "premade" && object.texture !== null) refuseUnknownVariant(`${font.id} texture`, list.textures[object.texture], object.texture, object.textureVariant)
  if (object.textureSource === "tileable" && object.tileableSource !== "minecraft") refuseUnknownVariant("tileable", tileables[object.tileable], object.tileable, object.tileableVariant)
  for (const kind of Object.keys(OVERLAY_KINDS)) {
    for (const layer of activeOverlays(list, object, kind)) {
      if (layer.source !== "file" && !list[kind][layer.overlay]) throw new Error(`there is no ${font.id} overlay called ${layer.overlay}`)
    }
  }
}

function errorsOf(title) {
  return title.objects.map(object => title.runtime[object.id]?.error)
}

function settled(title, items) {
  return new Promise((fulfil, reject) => {
    const errors = () => errorsOf(title)
    const limit = setTimeout(() => finish(reject, new Error("the title took too long to load")), TIME_LIMIT)
    let stop = null
    function finish(settle, value) {
      clearTimeout(limit)
      stop?.()
      settle(value)
    }
    function check() {
      const failed = errors().find(Boolean)
      if (failed) finish(reject, new Error(failed))
      else if (items.value.every(item => item.settled)) finish(fulfil)
    }
    stop = watch([items, errors], check)
    check()
  })
}

function painted() {
  return new Promise(fulfil => platform.frame(() => platform.frame(fulfil)))
}

function scales(title) {
  return title.objects.map(object => [object.scaleX, object.scaleY, object.matchScale, object.matchOffset]).join()
}

async function shoot(items, width) {
  const scene = new THREE.Scene()
  const entries = items.map(item => {
    const entry = createEntry()
    scene.add(entry.group)
    updateEntry(entry, item)
    return entry
  })
  try {
    const framed = titleFraming(items, VIEW.fixedDistance)
    if (!framed) return null
    const camera = new THREE.PerspectiveCamera(VIEW.fov, STAGE_WIDTH / STAGE_HEIGHT, 1, 5000)
    frameCamera(camera, { ...framed, fov: VIEW.fov, width: STAGE_WIDTH, height: STAGE_HEIGHT })
    sortEntries(entries, camera)
    return await renderTitle(new THREE.Vector2(STAGE_WIDTH, STAGE_HEIGHT), scene, camera, width, true, { signal: new AbortController().signal, progress: () => {} })
  } finally {
    for (const entry of entries) destroyEntry(entry)
  }
}

export async function titleCanvas(code, width = PICTURE_WIDTH) {
  const [fonts, tileables] = await loadLibrary()
  const decoded = decodeTitle(code)
  const unknown = unknownSetting(decoded.lines)
  if (unknown) throw new Error(`the title has a setting this version does not know: ${unknown}`)
  const title = createTitle(reactive(readTitleObjects(decoded)), VIEW)
  await Promise.all(title.objects.map(object => refuseUnknownNames(object, fonts, tileables)))
  const scope = effectScope(true)
  const items = scope.run(() => {
    keepMatched(title)
    return createTitleItems(title)
  })
  const apps = title.objects.map(object => NOTHING_RENDERED.createApp(ObjectRenderer, { object, title, fonts, tileables }))
  for (const app of apps) app.mount({})
  try {
    let before
    do {
      before = scales(title)
      await settled(title, items)
      await painted()
    } while (scales(title) !== before)
    const failed = errorsOf(title).find(Boolean)
    if (failed) throw new Error(failed)
    return await shoot(items.value, width)
  } finally {
    for (const app of apps) app.unmount()
    scope.stop()
  }
}

export async function renderPicture(code) {
  const canvas = await titleCanvas(code)
  return canvas?.toDataURL("image/webp", PICTURE_QUALITY) ?? null
}
