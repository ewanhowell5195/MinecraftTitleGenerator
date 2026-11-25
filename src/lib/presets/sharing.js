import { computed, onMounted } from "vue"
import { inThisPlace, thisPlace } from "../core/place.js"
import { refreshUsage, usage } from "../state/community.js"
import { replaceWith, sharePreset } from "./savedPresets.js"
import { saveOver, savePreset } from "./savingPreset.js"

export const SHARE_INTRO = "Share your title so other people can find it in the community presets and use it for themselves."
export const SHARING_AS = "Your username will show on this preset, and you can rename or delete it later."

export function withoutAccountText() {
  return [
    `Sign in to show your username on this preset and manage it from any device. Without an account, you can only rename or delete it from ${thisPlace()}, and you lose that if ${thisPlace()}'s saved data is cleared.`,
    `Signing in ${inThisPlace()} later moves your saved presets and everything shared from it to your account, with your username showing on them.`
  ]
}

export function useShareUsage() {
  const left = computed(() => usage.value && Math.max(0, usage.value.limit - usage.value.used))
  const full = computed(() => !!usage.value && !left.value)
  const counted = computed(() => !!usage.value && !usage.value.unlimited)
  const text = computed(() => full.value ? `No shares left today. You can share more after ${new Date(usage.value.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : `${left.value} of ${usage.value.limit} shares left today`)
  const pips = computed(() => Array.from({ length: usage.value.limit }, (pip, index) => index < left.value))
  onMounted(() => refreshUsage())
  return { counted, full, text, pips }
}

async function shareSaved(preset) {
  try {
    return await sharePreset(preset, preset.name)
  } catch (err) {
    throw new Error(`Your preset was saved, but it could not be shared. ${err.message}`)
  }
}

export async function saveThenShare(target, name) {
  if (!target) {
    const preset = savePreset(name, { keepOpen: true })
    return preset && shareSaved(preset)
  }
  const { preset, online } = await saveOver(target, name)
  return online ?? shareSaved(preset)
}

export async function publishPreset(preset, target, name) {
  return target ? (await replaceWith(target, preset.code, name)).online : sharePreset(preset, name)
}
