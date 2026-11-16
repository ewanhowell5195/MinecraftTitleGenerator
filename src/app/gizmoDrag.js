import * as THREE from "three"
import { holdHistory } from "../lib/state/history.js"
import { round } from "../lib/core/maths.js"
import { current, currentWord, setScale, shapingWord } from "../lib/state/scene.js"
import { TRANSFORM_LIMITS } from "../lib/settings/settings.js"
import { view } from "../lib/state/view.js"
import { gizmoPose, lineBounds, movedBy, rotatedTo, wordMovedBy, wordPose, wordRotatedTo } from "../render/placement.js"

const AXES = ["X", "Y", "Z"]

function axes(prefix, values) {
  return Object.fromEntries(values.map((value, index) => [`${prefix}${AXES[index]}`, value]))
}

export function useGizmoDrag(rig, { props, invalidate }) {
  const proxy = new THREE.Object3D()
  let grabbed = null

  function target() {
    if (!view.gizmo || view.section !== "transform") return null
    const usable = item => item.built?.body.triangles && item.transform
    if (shapingWord.value) return props.items.find(item => item.id === currentWord.value.id && usable(item)) ?? null
    return props.items.find(item => props.selected.includes(item.id) && usable(item)) ?? null
  }

  function pose() {
    if (rig.controls.dragging) return
    const item = target()
    if (!item) {
      rig.controls.detach()
      return
    }
    const word = shapingWord.value
    const { position, quaternion } = word ? wordPose(item.transform, item.built, view.gizmo !== "translate") : gizmoPose(item.transform, lineBounds(item.built))
    proxy.position.copy(position)
    proxy.quaternion.copy(quaternion)
    proxy.scale.set(...(word ? item.transform.word.userScale : item.transform.userScale))
    rig.controls.setMode(view.gizmo)
    if (rig.controls.object !== proxy) rig.controls.attach(proxy)
  }

  function grab() {
    const item = target()
    grabbed = { transform: item.transform, built: item.built, word: shapingWord.value, position: proxy.position.clone() }
    holdHistory(true)
  }

  function release() {
    grabbed = null
    holdHistory(false)
    invalidate()
  }

  function dragWord() {
    const object = currentWord.value
    const { transform, built } = grabbed
    if (rig.controls.mode === "translate") {
      const { translate, position } = wordMovedBy(transform, built, proxy.position.clone().sub(grabbed.position))
      proxy.position.copy(position)
      Object.assign(object, axes("wordTranslate", translate))
    } else if (rig.controls.mode === "rotate") {
      Object.assign(object, axes("wordRotation", wordRotatedTo(transform, proxy.quaternion)))
    } else {
      applyScale(object, "wordScale")
    }
  }

  function applyScale(object, prefix) {
    const scale = proxy.scale.toArray().map(axis => Math.max(round(axis, 4), TRANSFORM_LIMITS.scale[0]))
    proxy.scale.fromArray(scale)
    for (const [index, axis] of AXES.entries()) {
      if (rig.controls.axis.includes(axis)) setScale(object, `${prefix}${axis}`, scale[index])
    }
  }

  function drag() {
    if (!grabbed) return
    if (grabbed.word) return dragWord()
    const object = current.value
    const { transform } = grabbed
    if (rig.controls.mode === "translate") {
      const { translate, offset } = movedBy(transform, proxy.position.clone().sub(grabbed.position))
      proxy.position.copy(grabbed.position).add(offset)
      Object.assign(object, axes("translate", translate))
    } else if (rig.controls.mode === "rotate") {
      const { rotate, translate } = rotatedTo(transform, proxy.quaternion)
      Object.assign(object, axes("rotation", rotate), axes("translate", translate))
    } else {
      applyScale(object, "scale")
    }
  }

  function cancelDrag() {
    if (grabbed) holdHistory(false)
  }

  return { proxy, pose, grab, release, drag, cancelDrag }
}
