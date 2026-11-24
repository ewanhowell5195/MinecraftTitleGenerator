import { GOOGLE_STATS } from "../font/googleCatalog.js"
import { isCustomFont } from "../settings/settings.js"
import { OVERLAY_KINDS } from "../settings/textureDefaults.js"

export function minecraftStatId(id) {
  return `tileable.minecraft.${id}`
}

export function googleStatId(family) {
  return `${GOOGLE_STATS}.${family}`
}

export function googleFamily(object) {
  return isCustomFont(object.font) ? object.customFont?.google ?? null : null
}

export function statScope(object, id) {
  return googleFamily(object) ? GOOGLE_STATS : id
}

export function titleStats(objects) {
  const ids = new Set()
  const minecraft = new Map()
  for (const object of objects) {
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
