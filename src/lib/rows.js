import { editorTitle } from "./scene.js"

const STACK = {
  top: { scale: 1, pad: true, spacing: 1 },
  bottom: { scale: 1.67665, pad: true, spacing: 1.67665 },
  small: { scale: 0.43021, pad: false, spacing: 1 }
}

export const DEFAULT_HEIGHT = 44
export const DEFAULT_CAP_HEIGHT = 40

export const heights = editorTitle.heights

function extent(object, title) {
  const stack = STACK[object.type]
  const { height = DEFAULT_HEIGHT, capHeight = DEFAULT_CAP_HEIGHT, arc = { top: 0, bottom: 0 }, scaleY = object.scaleY } = title.heights[object.id] ?? {}
  const pad = stack.pad ? 2 * object.border * (object.scaleOutline ? scaleY : 1) : 0
  return stack.scale * ((capHeight + arc.top + arc.bottom) * scaleY + height - capHeight + pad)
}

function startAfter(object, end, above) {
  return above ? end + STACK[object.type].spacing * object.rowSpacing : end
}

function startBelow(object, end, title) {
  return end - STACK[object.type].spacing * object.rowSpacing - extent(object, title)
}

function visibleRows(object, title) {
  return Map.groupBy(title.objects.filter(other => !other.hidden && other.type === object.type), other => other.row)
}

function rowBelow(object, title) {
  const rows = visibleRows(object, title)
  let end = 0
  for (let row = -1; row > object.row; row--) {
    end = Math.min(...(rows.get(row) ?? [object]).map(other => startBelow(other, end, title)))
  }
  return startBelow(object, end, title)
}

export function rowStart(object, title = editorTitle) {
  if (object.row < 0) return rowBelow(object, title)
  const rows = visibleRows(object, title)
  let end = 0
  for (let row = 0; row < object.row; row++) {
    end = Math.max(...(rows.get(row) ?? [object]).map(other => startAfter(other, end, row > 0) + extent(other, title)))
  }
  return startAfter(object, end, object.row > 0)
}
