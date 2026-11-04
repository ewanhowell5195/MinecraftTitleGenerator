import { shallowRef } from "vue"
import { scene } from "./scene.js"
import { OVERLAY_KINDS } from "./settings.js"

const API = "https://api.wynem.com/minecrafttitlegenerator/stats"

const counts = shallowRef(new Map())

let submitted = null

export async function loadStats() {
  const response = await fetch(API)
  if (!response.ok) throw new Error(`failed to load the title stats: ${response.status}`)
  counts.value = new Map((await response.json()).map(entry => [entry.id, entry.count]))
}

export function popular(entries, id) {
  return entries.slice().sort((a, b) => (counts.value.get(id(b)) ?? 0) - (counts.value.get(id(a)) ?? 0))
}

function statIds() {
  const ids = new Set()
  for (const object of scene.objects) {
    if (object.hidden || !object.text.trim()) continue
    ids.add(object.font)
    if (object.textureSource === "premade") ids.add(`${object.font}.${object.texture}`)
    if (object.textureSource === "tileable") ids.add(`tileable.${object.tileable}`)
    for (const [kind, mode] of Object.entries(OVERLAY_KINDS)) {
      if (object[mode] !== "custom") continue
      for (const layer of object[kind]) {
        if (layer.source === "premade") ids.add(`${object.font}.${layer.overlay}`)
      }
    }
  }
  return Array.from(ids)
}

export async function submitStats() {
  if (import.meta.env.DEV) return
  const title = JSON.stringify(scene.objects)
  const ids = statIds()
  if (title === submitted || !ids.length) return
  submitted = title
  try {
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
    if (!response.ok) throw new Error(`failed to submit the title stats: ${response.status}`)
  } catch (err) {
    if (submitted === title) submitted = null
    console.error(err)
  }
}
