import { computed } from "vue"
import { buildHoles } from "./build.js"
import { framing } from "./framing.js"
import { editorTitle, words } from "./scene.js"
import { isModified } from "./settings.js"

export function paintLine(object) {
  return object.group === null || object.layerWords ? `word-${object.id}` : `line-${object.group}`
}

export function createTitleItems(title) {
  return computed(() => {
    const list = title.objects.filter(object => !words(object, title).every(word => word.hidden)).map(object => {
      const state = title.runtime[object.id]
      return { id: object.id, line: object.group === null || isModified(object, "wordTransform") ? `word-${object.id}` : `line-${object.group}`, paintLine: paintLine(object), type: object.type, built: state?.built ?? null, outline: state?.outline ?? null, halo: state?.halo ?? null, haloColour: framing.outlineColour, transform: state?.transform ?? null, settled: state?.settled ?? false, clipHoles: object.clipHoles, holes: null, hidden: object.hidden }
    })
    for (const members of Map.groupBy(list, item => item.line).values()) {
      const shown = members.filter(item => !item.hidden)
      const outlines = shown.flatMap(item => item.outline ?? [])
      if (members[0].clipHoles && outlines.length) shown[0].holes = buildHoles(outlines)
    }
    return list
  })
}

export const titleItems = createTitleItems(editorTitle)
