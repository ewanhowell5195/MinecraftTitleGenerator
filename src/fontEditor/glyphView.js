import { computed, ref, watch } from "vue"
import { widthOf } from "../lib/font/editor/glyph.js"
import { clamp } from "../lib/core/maths.js"
import { font, glyph, selected } from "./store.js"

export const GUTTER_GAP = 6
export const GUTTER = 18
const FIT_MARGIN = 12
const MAX_CELL = 40
const MIN_CELL = 3
const MAX_ZOOM_CELL = 160
const PAN_KEEP = 48

export function useGlyphView() {
  const available = ref({ width: 300, height: 300 })
  const zoomed = ref(null)

  const columns = computed(() => widthOf(font.value, glyph.value))
  const rows = computed(() => glyph.value.rows.length)
  const fitted = computed(() => {
    const { width, height } = available.value
    const room = (across, down) => Math.min((width - FIT_MARGIN * 2 - GUTTER - GUTTER_GAP) / across, (height - FIT_MARGIN * 2) / down)
    const cell = clamp(Math.floor(Math.min(room(font.value.width, font.value.height), room(columns.value, rows.value))), MIN_CELL, MAX_CELL)
    return { cell, x: Math.round((width - columns.value * cell - GUTTER_GAP - GUTTER) / 2), y: Math.round((height - rows.value * cell) / 2) }
  })
  const view = computed(() => zoomed.value ?? fitted.value)
  const zoomPercent = computed(() => Math.round(view.value.cell / fitted.value.cell * 100))
  const board = computed(() => {
    const right = xAt(columns.value)
    return { left: xAt(0), top: yAt(0), right, bottom: yAt(rows.value), gutter: Math.min(right + GUTTER_GAP, available.value.width - GUTTER) }
  })

  function xAt(column) {
    return Math.round(view.value.x + column * view.value.cell)
  }

  function yAt(row) {
    return Math.round(view.value.y + row * view.value.cell)
  }

  function clampRow(row) {
    return clamp(row, 0, rows.value - 1)
  }

  function clampX(x) {
    return clamp(x, 0, columns.value - 1)
  }

  function clampView({ cell, x, y }) {
    const across = columns.value * cell
    const down = rows.value * cell
    const keepX = Math.min(PAN_KEEP, across)
    const keepY = Math.min(PAN_KEEP, down)
    return { cell, x: clamp(x, keepX - across, available.value.width - keepX), y: clamp(y, keepY - down, available.value.height - keepY) }
  }

  function zoomTo(from, wanted, at, to = at) {
    const fit = fitted.value.cell
    const cell = clamp(wanted, Math.min(fit, Math.max(MIN_CELL, fit / 2)), Math.max(fit, MAX_ZOOM_CELL))
    const scale = cell / from.cell
    zoomed.value = clampView({ cell, x: to.x - (at.x - from.x) * scale, y: to.y - (at.y - from.y) * scale })
  }

  function fit() {
    zoomed.value = null
  }

  function middle() {
    return { x: available.value.width / 2, y: available.value.height / 2 }
  }

  watch(selected, () => {
    zoomed.value = null
  })

  return { available, zoomed, columns, rows, fitted, view, zoomPercent, board, xAt, yAt, clampRow, clampX, clampView, zoomTo, fit, middle }
}
