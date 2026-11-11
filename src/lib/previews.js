import { reactive } from "vue"
import * as THREE from "three"
import { cornersOf, createEntry, cullsOutlines, destroyEntry, frameCamera, updateEntry } from "./stage.js"

const SIZE = 128
const FOV = 8

export const previews = reactive({})

const entries = new Map()
let renderer = null
let scene = null
let camera = null

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  scene = new THREE.Scene()
  cullsOutlines(scene)
  camera = new THREE.PerspectiveCamera(FOV, 1, 1, 5000)
}

export function renderPreview(id, item) {
  if (!renderer) setup()
  let entry = entries.get(id)
  if (!entry) {
    entry = createEntry()
    scene.add(entry.group)
    entries.set(id, entry)
  }
  for (const [key, other] of entries) other.group.visible = key === id
  updateEntry(entry, item)
  if (entry.outline) entry.outline.renderOrder = 0
  if (entry.solid) entry.solid.renderOrder = 1
  const bounds = new THREE.Box3().setFromObject(entry.group)
  if (bounds.isEmpty()) {
    previews[id] = null
    return
  }
  frameCamera(camera, { anchor: bounds, corners: cornersOf(bounds), size: bounds.getSize(new THREE.Vector3()).length(), fov: FOV, width: SIZE, height: SIZE })
  renderer.render(scene, camera)
  previews[id] = renderer.domElement.toDataURL("image/png")
}

export function dropPreview(id) {
  const entry = entries.get(id)
  if (entry) {
    destroyEntry(entry)
    scene.remove(entry.group)
    entries.delete(id)
  }
  delete previews[id]
}
