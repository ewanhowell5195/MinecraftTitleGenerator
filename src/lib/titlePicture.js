import { createApp, effectScope, h, reactive, watch } from "vue"
import * as THREE from "three"
import ObjectRenderer from "../components/ObjectRenderer.js"
import { loadTileables } from "./assets.js"
import { readTitleObjects } from "./file.js"
import { loadFontList } from "./font.js"
import { createTitleItems } from "./items.js"
import { decodeTitle } from "./linkformat.js"
import { keepMatched } from "./match.js"
import { renderTitle } from "./render.js"
import { createEntry, destroyEntry, frameCamera, sortEntries, titleFraming, updateEntry } from "./stage.js"
import { createTitle } from "./title.js"
import { DEFAULT_FOV } from "./view.js"

const STAGE_WIDTH = 1000
const STAGE_HEIGHT = 500
// the 1024px cap on the big view in PresetsPage.vue minus its border and padding in PresetDetail.vue and on .large in TitlePicture.vue
const PICTURE_WIDTH = 935
const PICTURE_QUALITY = 0.85
const TIME_LIMIT = 180000
const VIEW = { render: false, fov: DEFAULT_FOV, fixedDistance: false }

let library = null

function loadLibrary() {
  library ??= Promise.all([loadFontList(), loadTileables()]).catch(err => {
    library = null
    throw err
  })
  return library
}

function settled(title, items) {
  return new Promise((fulfil, reject) => {
    const errors = () => title.objects.map(object => title.runtime[object.id]?.error)
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
  return new Promise(fulfil => requestAnimationFrame(() => requestAnimationFrame(fulfil)))
}

function scales(title) {
  return title.objects.map(object => [object.scaleX, object.scaleY]).join()
}

async function shoot(items) {
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
    const shot = await renderTitle(new THREE.Vector2(STAGE_WIDTH, STAGE_HEIGHT), scene, camera, PICTURE_WIDTH, true, { signal: new AbortController().signal, progress: () => {} })
    return shot?.toDataURL("image/webp", PICTURE_QUALITY) ?? null
  } finally {
    for (const entry of entries) destroyEntry(entry)
  }
}

export async function renderPicture(code) {
  const [fonts, tileables] = await loadLibrary()
  const title = createTitle(reactive(readTitleObjects(decodeTitle(code))), VIEW)
  const scope = effectScope(true)
  const items = scope.run(() => {
    keepMatched(title)
    return createTitleItems(title)
  })
  const app = createApp({ render: () => title.objects.map(object => h(ObjectRenderer, { key: object.id, object, title, fonts, tileables })) })
  app.mount(document.createElement("div"))
  try {
    let before
    do {
      before = scales(title)
      await settled(title, items)
      await painted()
    } while (scales(title) !== before)
    return await shoot(items.value)
  } finally {
    app.unmount()
    scope.stop()
  }
}
