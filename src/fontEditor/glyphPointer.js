import { ref, watch } from "vue"
import { depthOf } from "../lib/font/editor/depths.js"
import { setGlyph, yOfRow } from "../lib/font/editor/glyph.js"
import { blockAt, fillCells, lineCells, paint, rectangleCells, setStretch } from "../lib/font/editor/painting.js"
import { GUTTER, GUTTER_GAP } from "./glyphView.js"
import { beginStroke, cancelStroke, endStroke, font, glyph, inkCode, pencilDepth, selected, strokeTo, typing, updateGlyph } from "./store.js"

const PICKER_PATHS = ["M3 21l2.5-2.5", "M5.5 18.5v-2l7.5-7.5 2 2-7.5 7.5z", "M11.5 7.5l5 5", "M14 7l2.5-2.5a2.1 2.1 0 0 1 3 3L17 10"]
export const PICKER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${["#fff", "#000"].map((colour, index) => PICKER_PATHS.map(path => `<path d="${path}" stroke="${colour}" stroke-width="${index ? 1.5 : 3.5}"/>`).join("")).join("")}</svg>`)}") 3 21, crosshair`

export function useGlyphPointer({ canvas, tool, brush, drawFont }, { available, view, board, zoomed, clampRow, clampX, clampView, zoomTo }) {
  const hover = ref(null)
  const spaceHeld = ref(false)
  const altHeld = ref(false)
  const panning = ref(false)
  const outside = ref(false)
  const touches = new Map()
  let stroke = null
  let anchor = null
  let lastAt = null
  let gesture = null
  let pendingFill = null
  let blockingMenu = false
  let beforeEraser = "pencil"
  let over = false

  function local(event) {
    const box = canvas.value.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  function locate(event) {
    const { x: px, y: py } = local(event)
    const { cell, x, y } = view.value
    const { left, top, right, bottom, gutter } = board.value
    const across = py >= top && py < bottom
    return { gutter: across && px >= gutter - GUTTER_GAP && px < gutter + GUTTER + GUTTER_GAP, inside: across && px >= left && px < right, x: Math.floor((px - x) / cell), row: Math.floor((py - y) / cell) }
  }

  function wheel(event) {
    event.preventDefault()
    const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? available.value.height : 1
    zoomTo(view.value, view.value.cell * Math.exp(-event.deltaY * lines * (event.ctrlKey ? 0.01 : 0.0015)), local(event))
  }

  function applyStretch(row) {
    const at = clampRow(row)
    if (stroke.row === at) return
    stroke.row = at
    const next = setStretch(drawFont.value, stroke.base, at, stroke.value)
    stroke.base = next
    strokeTo(setGlyph(font.value, selected.value, next))
  }

  function sameSquare(a, b) {
    const [first] = blockAt(drawFont.value, stroke.base, a.x, a.row)
    const [second] = blockAt(drawFont.value, stroke.base, b.x, b.row)
    return first.x === second.x && first.row === second.row
  }

  function diagonal(from, to) {
    const reach = Math.max(Math.abs(to.x - from.x), Math.abs(to.row - from.row))
    return { x: clampX(from.x + Math.sign(to.x - from.x) * reach), row: clampRow(from.row + Math.sign(to.row - from.row) * reach) }
  }

  function applyPaint(at, shift) {
    lastAt = at
    const point = { x: clampX(at.x), row: clampRow(at.row) }
    const base = stroke.base
    if (stroke.shape === "rectangle") {
      const end = shift ? diagonal(stroke.from, point) : point
      const drawn = stroke.end && sameSquare(stroke.end, end)
      stroke.end = end
      if (drawn) return
      const cells = rectangleCells(drawFont.value, base, stroke.from, end)
      strokeTo(setGlyph(font.value, selected.value, paint(base, cells, stroke.value)))
      return
    }
    if (shift && !stroke.constrain) Object.assign(stroke, { constrain: true, origin: stroke.last ?? stroke.from, axis: null })
    if (!shift) stroke.constrain = false
    const target = stroke.constrain ? constrained(point) : point
    const from = stroke.last ?? target
    const drawn = stroke.drawn && sameSquare(from, target)
    stroke.last = target
    if (drawn) return
    stroke.drawn = true
    stroke.latest = paint(stroke.latest, lineCells(drawFont.value, stroke.latest, from, target), stroke.value)
    strokeTo(setGlyph(font.value, selected.value, stroke.latest))
  }

  function constrained(point) {
    const { origin } = stroke
    const dx = Math.abs(point.x - origin.x)
    const dy = Math.abs(point.row - origin.row)
    if (!stroke.axis && Math.max(dx, dy) >= brush.value && dx !== dy) stroke.axis = dx > dy ? "x" : "row"
    if (stroke.axis === "x") return { x: point.x, row: origin.row }
    if (stroke.axis === "row") return { x: origin.x, row: point.row }
    return origin
  }

  function startPinch() {
    if (stroke) cancelStroke()
    stroke = null
    pendingFill = null
    hover.value = null
    const [first, second] = Array.from(touches.values())
    gesture = { kind: "pinch", centre: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }, distance: Math.hypot(first.x - second.x, first.y - second.y) || 1, view: view.value }
  }

  function pinch() {
    const [first, second] = Array.from(touches.values())
    const box = canvas.value.getBoundingClientRect()
    const centre = { x: (first.x + second.x) / 2 - box.left, y: (first.y + second.y) / 2 - box.top }
    const scale = Math.hypot(first.x - second.x, first.y - second.y) / gesture.distance
    zoomTo(gesture.view, gesture.view.cell * scale, { x: gesture.centre.x - box.left, y: gesture.centre.y - box.top }, centre)
  }

  function startPan(event) {
    gesture = { kind: "pan", pointerId: event.pointerId, from: { x: event.clientX, y: event.clientY }, view: view.value }
    panning.value = true
    hover.value = null
  }

  function pan(event) {
    const { from, view: start } = gesture
    zoomed.value = clampView({ ...start, x: start.x + event.clientX - from.x, y: start.y + event.clientY - from.y })
  }

  function down(event) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    canvas.value.setPointerCapture(event.pointerId)
    if (event.pointerType === "touch") {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.size > 1) return startPinch()
    }
    if (gesture) return
    const at = locate(event)
    if (event.button === 1 || (event.button === 0 && (spaceHeld.value || (!at.inside && !at.gutter)))) {
      event.preventDefault()
      return startPan(event)
    }
    if (event.button !== 0 && event.button !== 2) return
    event.preventDefault()
    if (event.altKey && event.button === 0 && at.inside) {
      stroke = { kind: "pick" }
      pick(at)
      return
    }
    if (event.button === 2 && !blockingMenu) {
      blockingMenu = true
      addEventListener("contextmenu", blockMenu, true)
    }
    const erasing = event.button === 2 || tool.value === "eraser"
    if (at.gutter) {
      const row = clampRow(at.row)
      const y = yOfRow(font.value, glyph.value, row)
      beginStroke()
      stroke = { kind: "stretch", base: glyph.value, value: event.button === 2 ? false : !glyph.value.stretch.includes(y) }
      applyStretch(row)
      return
    }
    const point = { x: clampX(at.x), row: clampRow(at.row) }
    if (tool.value === "fill") {
      const code = erasing ? false : inkCode()
      const fill = () => updateGlyph(paint(glyph.value, fillCells(glyph.value, point.x, point.row), code))
      if (event.pointerType === "touch") pendingFill = { pointerId: event.pointerId, fill }
      else fill()
      return
    }
    beginStroke()
    const shape = tool.value === "rectangle" ? "rectangle" : "pencil"
    stroke = { kind: "paint", base: glyph.value, latest: glyph.value, value: erasing ? false : inkCode(), from: point, last: null, end: null, shape, constrain: shape === "pencil" && event.shiftKey, origin: point, axis: null }
    if (stroke.constrain && anchor) {
      stroke.latest = paint(glyph.value, lineCells(drawFont.value, glyph.value, anchor, point), stroke.value)
      stroke.last = point
    }
    applyPaint(at, event.shiftKey)
  }

  function move(event) {
    if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (gesture) {
      if (gesture.kind === "pinch") pinch()
      else if (event.pointerId === gesture.pointerId) pan(event)
      return
    }
    altHeld.value = event.altKey
    const at = locate(event)
    if (stroke?.kind === "stretch") applyStretch(at.row)
    else if (stroke?.kind === "pick") pick(at)
    else if (stroke) applyPaint(at, event.shiftKey)
    updateHover(at)
  }

  function pick(at) {
    if (!at.inside) return
    const code = glyph.value.rows[clampRow(at.row)][clampX(at.x)]
    if (code === "0") {
      tool.value = "eraser"
      return
    }
    pencilDepth.value = depthOf(font.value, code) * 100
    if (tool.value === "eraser") tool.value = beforeEraser
  }

  function updateHover(at) {
    outside.value = !at.inside && !at.gutter
    if (stroke || spaceHeld.value || outside.value) {
      hover.value = null
      return
    }
    const block = blockAt(drawFont.value, glyph.value, at.gutter ? 0 : clampX(at.x), clampRow(at.row))
    const row = Math.min(...block.map(item => item.row))
    const next = at.gutter ? { gutter: true, column: 0, row, across: 1, down: Math.max(...block.map(item => item.row)) - row + 1 } : { gutter: false, column: Math.min(...block.map(item => item.x)), row, across: brush.value, down: brush.value }
    if (!hover.value || Object.keys(next).some(key => hover.value[key] !== next[key])) hover.value = next
  }

  function up(event) {
    touches.delete(event.pointerId)
    if (gesture) {
      if (gesture.kind === "pinch" ? touches.size < 2 : event.pointerId === gesture.pointerId) {
        gesture = null
        panning.value = false
      }
      return
    }
    if (pendingFill?.pointerId === event.pointerId) {
      if (event.type === "pointerup") pendingFill.fill()
      pendingFill = null
    }
    if (stroke?.kind === "paint" && stroke.shape !== "rectangle") anchor = stroke.end ?? stroke.last
    if (stroke && stroke.kind !== "pick") endStroke()
    stroke = null
    if (blockingMenu) setTimeout(unblockMenu)
  }

  function blockMenu(event) {
    event.preventDefault()
  }

  function unblockMenu() {
    blockingMenu = false
    removeEventListener("contextmenu", blockMenu, true)
  }

  function enter() {
    over = true
  }

  function leave() {
    over = false
    outside.value = false
    if (!stroke) hover.value = null
  }

  function noAutoscroll(event) {
    if (event.button === 1) event.preventDefault()
  }

  function shiftChanged(event) {
    if (event.key !== "Shift" || stroke?.kind !== "paint" || !lastAt) return
    applyPaint(lastAt, event.type === "keydown")
  }

  function spaceChanged(event) {
    if (event.key !== " " || typing(event.target)) return
    const holding = event.type === "keydown"
    if (holding && !over && !panning.value) return
    if (holding || spaceHeld.value) event.preventDefault()
    spaceHeld.value = holding
    if (holding) hover.value = null
  }

  function altChanged(event) {
    if (event.key !== "Alt") return
    altHeld.value = event.type === "keydown"
    if (over) event.preventDefault()
  }

  function release() {
    spaceHeld.value = false
    altHeld.value = false
  }

  watch(tool, (next, previous) => {
    if (next === "eraser") beforeEraser = previous
  }, { flush: "sync" })
  watch(selected, () => {
    anchor = null
  })

  return { hover, spaceHeld, altHeld, panning, outside, down, move, up, enter, leave, noAutoscroll, wheel, shiftChanged, spaceChanged, altChanged, release, unblockMenu }
}
