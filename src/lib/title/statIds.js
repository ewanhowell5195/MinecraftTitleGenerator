import { GOOGLE_STATS } from "../font/googleCatalog.js"
import { isCustomFont } from "../settings/settings.js"

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
