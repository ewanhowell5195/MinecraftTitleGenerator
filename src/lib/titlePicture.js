import { createRenderer, effectScope, reactive, watch } from "vue"
import * as THREE from "three"
import ModelRenderer from "../components/ModelRenderer.js"
import ObjectRenderer from "../components/ObjectRenderer.js"
import { readTitleObjects } from "./file.js"
import { createTitleItems } from "./items.js"
import { decodeTitle, unknownSetting } from "./linkformat.js"
import { keepMatched } from "./match.js"
import { painted } from "./platform.js"
import { renderTitle, titleShot } from "./render.js"
import { isModelShape } from "./shapes.js"
import { createStage, frameCamera, titleFraming } from "./stage.js"
import { OFFSCREEN_VIEW, createTitle, firstError } from "./title.js"
import { loadLibrary, titleNameProblem } from "./titleNames.js"

const STAGE_WIDTH = 1000
const STAGE_HEIGHT = 500
// the 1024px cap on the big view in PresetsPage.vue minus its border and padding in PresetDetail.vue and on .large in TitlePicture.vue
const PICTURE_WIDTH = 935
// that view is 2:1 (aspect-ratio on .picture in TitlePicture.vue), so this is half its width minus the same padding
const PICTURE_HEIGHT = 443
const TIME_LIMIT = 180000
const NOTHING_RENDERED = createRenderer({ insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null, patchProp() {} })

function settled(title, items) {
  return new Promise((fulfil, reject) => {
    const limit = setTimeout(() => finish(reject, new Error("the title took too long to load")), TIME_LIMIT)
    let stop = null
    function finish(settle, value) {
      clearTimeout(limit)
      stop?.()
      settle(value)
    }
    function check() {
      const failed = firstError(title)
      if (failed) finish(reject, new Error(failed))
      else if (items.value.every(item => item.settled)) finish(fulfil)
    }
    stop = watch([items, () => firstError(title)], check)
    check()
  })
}

function scales(title) {
  return title.objects.map(object => [object.scaleX, object.scaleY, object.matchScale, object.matchOffset]).join()
}

async function shoot(items, width, fixedDistance) {
  const stage = createStage()
  const { scene } = stage
  stage.sync(items)
  try {
    const framed = titleFraming(items, fixedDistance)
    if (!framed) return null
    const camera = new THREE.PerspectiveCamera(OFFSCREEN_VIEW.fov, STAGE_WIDTH / STAGE_HEIGHT, 1, 5000)
    frameCamera(camera, { ...framed, fov: OFFSCREEN_VIEW.fov, width: STAGE_WIDTH, height: STAGE_HEIGHT })
    stage.sort(camera)
    const shot = titleShot(scene, camera, new THREE.Vector2(STAGE_WIDTH, STAGE_HEIGHT), 1)
    if (!shot) return null
    const { width: wide, height: tall } = shot
    const fit = Math.min(width / wide, Math.floor(width * PICTURE_HEIGHT / PICTURE_WIDTH) / tall)
    return await renderTitle(new THREE.Vector2(STAGE_WIDTH, STAGE_HEIGHT), scene, camera, Math.round(Math.max(wide, tall) * fit), true, { signal: new AbortController().signal, progress: () => {} })
  } finally {
    stage.dispose()
  }
}

export async function titleCanvas(code, width = PICTURE_WIDTH, fixedDistance = false) {
  const [fonts, tileables, shapes] = await loadLibrary()
  const decoded = decodeTitle(code)
  const unknown = unknownSetting(decoded.lines)
  if (unknown) throw new Error(`the title has a setting this version does not know: ${unknown}`)
  const problem = await titleNameProblem(decoded.lines)
  if (problem) throw new Error(problem)
  return pictureOf(titleOf(decoded, fixedDistance), fonts, tileables, width, shapes)
}

function titleOf(decoded, fixedDistance) {
  return createTitle(reactive(readTitleObjects(decoded)), { ...OFFSCREEN_VIEW, fixedDistance })
}

async function pictureOf(title, fonts, tileables, width, shapes) {
  const scope = effectScope(true)
  const items = scope.run(() => {
    keepMatched(title)
    return createTitleItems(title)
  })
  const apps = title.objects.map(object => isModelShape(shapes, object.shape) ? NOTHING_RENDERED.createApp(ModelRenderer, { object, title, shapes }) : NOTHING_RENDERED.createApp(ObjectRenderer, { object, title, fonts, tileables, shapes }))
  for (const app of apps) app.mount({})
  try {
    let before
    do {
      before = scales(title)
      await settled(title, items)
      await painted()
    } while (scales(title) !== before)
    const failed = firstError(title)
    if (failed) throw new Error(failed)
    return await shoot(items.value, width, title.view.fixedDistance)
  } finally {
    for (const app of apps) app.unmount()
    scope.stop()
  }
}
