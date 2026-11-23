import { shallowRef } from "vue"
import * as THREE from "three"
import { current, currentWord } from "../lib/state/scene.js"
import { wordKey } from "../lib/settings/settings.js"

const CENTRE_KEYS = { arc: "arcCentre", ribbon: "twistRibbonCentre", wrap: "twistDoorCentre", fan: "twistFanCentre" }

export const heldCentre = shallowRef(null)

export function holdCentre(kind, word) {
  heldCentre.value = { kind, word }
  const held = new AbortController()
  function release() {
    heldCentre.value = null
    held.abort()
  }
  window.addEventListener("pointerup", release, { signal: held.signal })
  window.addEventListener("pointercancel", release, { signal: held.signal })
}

export function centrePoint(entries) {
  const held = heldCentre.value
  if (!held) return null
  const object = held.word ? currentWord.value : current.value
  const entry = object && entries.get(object.id)
  const centres = entry?.built?.centres
  if (!centres) return null
  const span = held.word ? centres.word : centres.line
  const [from, to] = held.kind === "arc" ? span.extent : span.ends
  const key = name => held.word ? wordKey(name) : name
  const share = object[key(CENTRE_KEYS[held.kind])] / 100
  const lift = held.kind === "fan" && object[key("twistFanRoll")] ? (object[key("twistFanHeight")] / 100 - 0.5) * centres.height : 0
  const [back, front] = centres.depths
  const depth = held.kind === "wrap" && object[key("twistDoorRoll")] ? back + (front - back) * object[key("twistDoorDepth")] / 100 : 0
  const point = new THREE.Vector3(from + (to - from) * share, centres.y + lift, depth)
  return point.applyMatrix4(held.word ? entry.group.matrixWorld : entry.base)
}
