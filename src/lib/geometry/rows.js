import { wordsOf } from "../title/title.js"
import { effectiveScale } from "../settings/settings.js"

const STACK = {
  top: { scale: 1, spacing: 1 },
  bottom: { scale: 1.67665, spacing: 1.67665 },
  small: { scale: 0.43021, spacing: 1 }
}

export const DEFAULT_HEIGHT = 44
export const DEFAULT_CAP_HEIGHT = 40

export const NO_ARC = { top: 0, bottom: 0 }

function tallest(object, title, measure) {
  const reaches = [object].concat(wordsOf(object, title)).map(word => measure(title.heights[word.id] ?? {}))
  return { top: Math.max(...reaches.map(reach => reach.top)), bottom: Math.max(...reaches.map(reach => reach.bottom)) }
}

export function lineArc(object, title) {
  return tallest(object, title, ({ arc = NO_ARC }) => arc)
}

export function lineRoom(object, title) {
  return tallest(object, title, ({ arc = NO_ARC, twist = NO_ARC, scaleY = 1 }) => ({ top: arc.top + twist.top * (scaleY - 1), bottom: arc.bottom + twist.bottom * (scaleY - 1) }))
}

function extent(object, title) {
  const stack = STACK[object.type]
  const { height = DEFAULT_HEIGHT, capHeight = DEFAULT_CAP_HEIGHT, scaleY = effectiveScale(object)[1] } = title.heights[object.id] ?? {}
  const arc = lineArc(object, title)
  const pad = 2 * object.border * (object.scaleOutline ? scaleY : 1)
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

export function rowStart(object, title) {
  if (object.row === 0) return 0
  if (object.row < 0) return rowBelow(object, title)
  const rows = visibleRows(object, title)
  let end = 0
  for (let row = 0; row < object.row; row++) {
    end = Math.max(...(rows.get(row) ?? [object]).map(other => startAfter(other, end, row > 0) + extent(other, title)))
  }
  return startAfter(object, end, object.row > 0)
}
