import { shallowRef } from "vue"
import { scene } from "./scene.js"
import { OVERLAY_KINDS, isCustomFont } from "./settings.js"

const API = "https://api.wynem.com/minecrafttitlegenerator/stats"

const counts = shallowRef(new Map())

let submitted = null

export async function loadStats() {
  const response = await fetch(API)
  if (!response.ok) throw new Error(`failed to load the title stats: ${response.status}`)
  counts.value = new Map((await response.json()).map(entry => [entry.id, entry.count]))
}

export function popular(entries, id, label, pinned = []) {
  function rank(entry) {
    const at = pinned.indexOf(id(entry))
    return at === -1 ? pinned.length : at
  }
  return entries.slice().sort((a, b) => rank(a) - rank(b) || (counts.value.get(id(b)) ?? 0) - (counts.value.get(id(a)) ?? 0) || label(a).localeCompare(label(b)))
}

export function usage(ids) {
  return ids.reduce((total, id) => total + (counts.value.get(id) ?? 0), 0)
}

export function minecraftStatId(id) {
  return `tileable.minecraft.${id}`
}

function statIds() {
  const ids = new Set()
  const minecraft = new Map()
  for (const object of scene.objects) {
    if (object.hidden || !object.text.trim() || isCustomFont(object.font)) continue
    ids.add(object.font)
    if (object.textureSource === "premade") ids.add(`${object.font}.${object.texture}`)
    if (object.textureSource === "tileable" && object.tileableSource === "minecraft") minecraft.set(object.minecraftTexture, object.minecraftVersion)
    if (object.textureSource === "tileable" && object.tileableSource !== "minecraft") ids.add(`tileable.${object.tileable}`)
    for (const [kind, mode] of Object.entries(OVERLAY_KINDS)) {
      if (object[mode] !== "custom") continue
      for (const layer of object[kind]) {
        if (layer.source === "premade") ids.add(`${object.font}.${layer.overlay}`)
      }
    }
  }
  return { ids: Array.from(ids), minecraft: Array.from(minecraft, ([texture, version]) => ({ texture, version })) }
}

export async function submitStats() {
  if (import.meta.env.DEV) return
  const title = JSON.stringify(scene.objects)
  const { ids, minecraft } = statIds()
  if (title === submitted || !ids.length) return
  submitted = title
  try {
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(minecraft.length ? { ids, minecraft } : { ids }) })
    if (!response.ok) throw new Error(`failed to submit the title stats: ${response.status}`)
  } catch (err) {
    if (submitted === title) submitted = null
    console.error(err)
  }
}
