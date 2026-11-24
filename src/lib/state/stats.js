import { scene } from "./scene.js"
import { isCustomFont } from "../settings/settings.js"
import { OVERLAY_KINDS } from "../settings/textureDefaults.js"
import { loadCounts } from "../title/popularity.js"
import { googleFamily, googleStatId, statScope } from "../title/statIds.js"

const API = "https://api.wynem.com/minecrafttitlegenerator/stats"

let submitted = null

export function loadStats() {
  return loadCounts(API)
}

function statIds() {
  const ids = new Set()
  const minecraft = new Map()
  for (const object of scene.objects) {
    if (object.hidden || object.shape !== null || !object.text.trim() || isCustomFont(object.font) && !googleFamily(object)) continue
    const scope = statScope(object, object.font)
    ids.add(googleFamily(object) ? googleStatId(googleFamily(object)) : object.font)
    if (object.textureSource === "premade") ids.add(`${scope}.${object.texture}`)
    if (object.textureSource === "tileable" && object.tileableSource === "minecraft") minecraft.set(object.minecraftTexture, object.minecraftVersion)
    if (object.textureSource === "tileable" && object.tileableSource !== "minecraft") ids.add(`tileable.${object.tileable}`)
    for (const [kind, mode] of Object.entries(OVERLAY_KINDS)) {
      if (object[mode] !== "custom") continue
      for (const layer of object[kind]) {
        if (layer.source === "premade") ids.add(`${scope}.${layer.overlay}`)
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
