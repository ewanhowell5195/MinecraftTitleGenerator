import { reactive } from "vue"
import * as THREE from "three"
import { platform } from "./platform.js"
import { cornersOf, createStage, frameCamera } from "./stage.js"

const SIZE = 128
const FOV = 8

export const previews = reactive({})

const stage = createStage()
let renderer = null
let camera = null

function setup() {
  renderer = platform.createWebGLRenderer()
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  camera = new THREE.PerspectiveCamera(FOV, 1, 1, 5000)
}

export function renderPreview(id, item) {
  if (!renderer) setup()
  for (const other of stage.entries.values()) other.group.visible = false
  const entry = stage.update(id, item)
  if (entry.outline) entry.outline.renderOrder = 0
  if (entry.solid) entry.solid.renderOrder = 1
  const bounds = new THREE.Box3().setFromObject(entry.group)
  if (bounds.isEmpty()) {
    previews[id] = null
    return
  }
  frameCamera(camera, { anchor: bounds, corners: cornersOf(bounds), size: bounds.getSize(new THREE.Vector3()).length(), fov: FOV, width: SIZE, height: SIZE })
  renderer.render(stage.scene, camera)
  previews[id] = renderer.domElement.toDataURL("image/png")
}

export function dropPreview(id) {
  stage.drop(id)
  delete previews[id]
}
