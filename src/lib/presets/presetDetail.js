import { computed, ref, watch } from "vue"
import { platform } from "../core/platform.js"
import { presetPath } from "./presetPath.js"
import { sharedText, usesText } from "./presetText.js"

export function usePresetDetail(props, rename) {
  const renaming = ref(false)
  const figures = computed(() => props.local ? props.stats : props.preset)
  const uses = computed(() => usesText(figures.value))
  const sharedOn = computed(() => sharedText(figures.value.createdAt))

  function finishRenaming(event) {
    if (!renaming.value) return
    renaming.value = false
    rename(event.target.value)
  }

  watch(() => props.preset.code, () => (renaming.value = false))

  return { renaming, figures, uses, sharedOn, finishRenaming }
}

export async function copyPresetLink(id) {
  try {
    await navigator.clipboard.writeText(new URL(platform.asset(presetPath(id)), location.href).href)
    return "Link copied"
  } catch (err) {
    console.error(err)
    return "Could not copy"
  }
}
