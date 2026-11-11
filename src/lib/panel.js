import { computed } from "vue"
import { isModified, resetPanel, wordKey } from "./settings.js"
import { active, current, currentWord } from "./scene.js"

const font = computed(() => active.value.font)
const list = computed(() => active.value.list)

function context() {
  return { font: font.value, list: list.value }
}

export function usePanel(name, word = false) {
  const object = word ? currentWord : current
  return {
    object,
    font,
    list,
    modified: computed(() => isModified(object.value, name, context())),
    reset: () => resetPanel(object.value, name, context()),
    k: key => word ? wordKey(key) : key
  }
}
