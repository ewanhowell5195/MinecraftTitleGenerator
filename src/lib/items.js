import { computed } from "vue"
import { buildHoles } from "./build.js"
import { framing } from "./framing.js"
import { runtime, scene } from "./scene.js"
import { isModified } from "./settings.js"

export const titleItems = computed(() => {
  const list = scene.objects.filter(object => !object.hidden).map(object => {
    const state = runtime[object.id]
    return { id: object.id, line: object.group === null || isModified(object, "wordTransform") ? `word-${object.id}` : `line-${object.group}`, type: object.type, built: state?.built ?? null, outline: state?.outline ?? null, halo: state?.halo ?? null, haloColour: framing.outlineColour, transform: state?.transform ?? null, settled: state?.settled ?? false, clipHoles: object.clipHoles, holes: null }
  })
  for (const members of Map.groupBy(list, item => item.line).values()) {
    const outlines = members.flatMap(item => item.outline ?? [])
    if (members[0].clipHoles && outlines.length) members[0].holes = buildHoles(outlines)
  }
  return list
})
