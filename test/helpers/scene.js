import { createObject } from "../../src/lib/settings/objects.js"
import { scene, validSelection } from "../../src/lib/state/scene.js"

export function setTitle(...objects) {
  scene.objects.splice(0, scene.objects.length, ...objects)
  Object.assign(scene, validSelection(objects, null, null))
}

export function setScene(...objects) {
  scene.objects = objects
  Object.assign(scene, validSelection(objects, null, null))
  return objects
}

export function line(group, ...texts) {
  return texts.map(text => createObject({ text, group }))
}

export function texts() {
  return scene.objects.map(object => object.text)
}
