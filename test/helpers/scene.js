import { scene, validSelection } from "../../src/lib/state/scene.js"

export function setTitle(...objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
}
