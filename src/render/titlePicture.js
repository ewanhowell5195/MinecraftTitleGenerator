import { effectScope, reactive, watch } from "vue"
import * as THREE from "three"
import ModelRenderer from "./ModelRenderer.js"
import ObjectRenderer from "./ObjectRenderer.js"
import { fullCamera } from "../lib/settings/camera.js"
import { readTitleObjects } from "../lib/title/objects.js"
import { createTitleItems } from "../lib/title/items.js"
import { decodeTitle } from "../lib/link/linkformat.js"
import { unknownSetting } from "../lib/link/linkKeys.js"
import { keepMatched } from "../lib/title/match.js"
import { painted } from "../lib/core/platform.js"
import { renderTitle, titleShot } from "./render.js"
import { isModelShape } from "../lib/geometry/shapes.js"
import { createStage } from "./stage.js"
import { frameCamera, titleFraming } from "./titleFraming.js"
import { OFFSCREEN_VIEW, createTitle, firstError } from "../lib/title/title.js"
import { loadLibrary, titleNameProblem } from "../lib/link/titleNames.js"

const STAGE_WIDTH = 1000
const STAGE_HEIGHT = 500
// the 1024px cap on the big view in PresetsPage.vue minus its border and padding in PresetDetail.vue and on .large in TitlePicture.vue
const PICTURE_WIDTH = 935
// that view is 2:1 (aspect-ratio on .picture in TitlePicture.vue), so this is half its width minus the same padding
const PICTURE_HEIGHT = 443
const TIME_LIMIT = 180000

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

async function shoot(items, width, angle) {
  const stage = createStage()
  const { scene } = stage
  stage.sync(items)
  try {
    const framed = titleFraming(items, angle.fixedDistance)
    if (!framed) return null
    const camera = angle.fov ? new THREE.PerspectiveCamera(angle.fov, STAGE_WIDTH / STAGE_HEIGHT, 1, 5000) : new THREE.OrthographicCamera()
    frameCamera(camera, { ...framed, angle, width: STAGE_WIDTH, height: STAGE_HEIGHT })
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
  return createTitle(readTitleObjects(decoded), OFFSCREEN_VIEW, reactive(fullCamera({ ...decoded.camera, ...(fixedDistance && { fixedDistance }) })))
}

async function pictureOf(title, fonts, tileables, width, shapes) {
  const scope = effectScope(true)
  const items = scope.run(() => {
    keepMatched(title)
    for (const object of title.objects) {
      if (isModelShape(shapes, object.shape)) ModelRenderer.setup({ object, title, shapes })
      else ObjectRenderer.setup({ object, title, fonts, tileables, shapes })
    }
    return createTitleItems(title)
  })
  try {
    let before
    do {
      before = scales(title)
      await settled(title, items)
      await painted()
    } while (scales(title) !== before)
    const failed = firstError(title)
    if (failed) throw new Error(failed)
    return await shoot(items.value, width, title.camera)
  } finally {
    scope.stop()
  }
}
