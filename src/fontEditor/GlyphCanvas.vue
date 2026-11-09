<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import Icon from "../components/Icon.vue"
  import { NOTHING_OUTSIDE, blockAt, fillCells, lineCells, paint, rectangleCells, rowOfY, setGlyph, setStretch, widthOf, yOfRow } from "../lib/fontEditor.js"
  import { arrowsMove, beginStroke, cancelStroke, font, glyph, moveSelected, selected, strokeTo, typing, updateGlyph } from "./store.js"

  const TOOLS = [
    { id: "pencil", icon: "pencil", label: "Pencil", key: "b", hint: "Shift-click draws a line from the last point, holding Shift while drawing keeps it horizontal or vertical" },
    { id: "eraser", icon: "eraser", label: "Eraser", key: "e", hint: "Right-click also erases, Shift works like the pencil" },
    { id: "rectangle", icon: "rectangle", label: "Rectangle", key: "r", hint: "Hold Shift for a square" },
    { id: "fill", icon: "fill", label: "Fill", key: "f" }
  ]
  const GUTTER_GAP = 6
  const GUTTER = 18
  const FIT_MARGIN = 12
  const MAX_CELL = 40
  const MIN_CELL = 3
  const MAX_ZOOM_CELL = 160
  const PAN_KEEP = 48
  const KEY_ZOOM = 1.25
  const STRETCH_COLOUR = "#f59e0b"
  const GUIDE_FONT = "Arial, sans-serif"
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
  const KEY_ZOOMS = { "+": KEY_ZOOM, "=": KEY_ZOOM, "-": 1 / KEY_ZOOM }
  const GUIDES = { "\u{1F633}": "", "\u{1F629}": "\u2018", "'": "\u2019" }

  const tool = ref("pencil")
  const holder = ref(null)
  const canvas = ref(null)
  const available = ref({ width: 300, height: 300 })
  const hover = ref(null)
  const chosenBrush = ref(null)
  const zoomed = ref(null)
  const spaceHeld = ref(false)
  const panning = ref(false)
  const outside = ref(false)
  const touches = new Map()
  let stroke = null
  let anchor = null
  let lastAt = null
  let observer = null
  let gesture = null
  let pendingFill = null
  let blockingMenu = false
  let over = false
  let backdrop = "#000"

  const brushes = computed(() => Array.from({ length: font.value.grid }, (_, index) => font.value.grid - index).filter(size => font.value.grid % size === 0))
  const brush = computed(() => brushes.value.includes(chosenBrush.value) ? chosenBrush.value : font.value.grid)
  const drawFont = computed(() => ({ ...font.value, grid: brush.value }))
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function xAt(column) {
    return Math.round(view.value.x + column * view.value.cell)
  }

  function yAt(row) {
    return Math.round(view.value.y + row * view.value.cell)
  }

  function line(ctx, fromX, fromY, toX, toY) {
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
  }

  function drawGuide(ctx, centre, baseline, capHeight, width) {
    const text = GUIDES[selected.value] ?? selected.value.toUpperCase()
    if (!text.trim()) return
    ctx.save()
    ctx.font = `bold 100px ${GUIDE_FONT}`
    const capRatio = ctx.measureText("H").actualBoundingBoxAscent / 100
    ctx.font = `bold ${capHeight / capRatio}px ${GUIDE_FONT}`
    const measured = ctx.measureText(text)
    const textWidth = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight
    const below = Math.max(0, measured.actualBoundingBoxDescent)
    const tall = Math.min(1, capHeight / (measured.actualBoundingBoxAscent + below))
    const even = Math.min(tall, width * 0.9 / textWidth)
    const letter = /^[\p{L}\p{N}]+$/u.test(text)
    ctx.translate(centre, baseline - below * (letter ? tall : even))
    ctx.scale(letter ? width / textWidth : even, letter ? tall : even)
    ctx.fillStyle = "#2f7cf659"
    ctx.fillText(text, (measured.actualBoundingBoxLeft - measured.actualBoundingBoxRight) / 2, 0)
    ctx.restore()
  }

  function draw() {
    const element = canvas.value
    if (!element) return
    const { width, height } = available.value
    const ratio = devicePixelRatio || 1
    element.width = Math.round(width * ratio)
    element.height = Math.round(height * ratio)
    const ctx = element.getContext("2d")
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const current = glyph.value
    const currentFont = font.value
    const { left, top, right, bottom, gutter } = board.value
    const topline = yAt(current.above)
    const baseline = yAt(current.above + currentFont.height)
    ctx.fillStyle = "#fff"
    ctx.fillRect(left, top, right - left, bottom - top)
    ctx.fillStyle = "#dfe8f2"
    if (current.above) ctx.fillRect(left, top, right - left, topline - top)
    if (current.below) ctx.fillRect(left, baseline, right - left, bottom - baseline)
    drawGuide(ctx, (left + right) / 2, baseline, baseline - topline, right - left)
    ctx.fillStyle = "#000"
    current.rows.forEach((text, row) => {
      for (let x = 0; x < text.length; x++) if (text[x] === "1") ctx.fillRect(xAt(x), yAt(row), xAt(x + 1) - xAt(x), yAt(row + 1) - yAt(row))
    })
    ctx.lineWidth = 1
    if (view.value.cell >= 8) {
      ctx.strokeStyle = "#8888882e"
      ctx.beginPath()
      for (let x = 1; x < columns.value; x++) line(ctx, xAt(x) + 0.5, top, xAt(x) + 0.5, bottom)
      for (let row = 1; row < rows.value; row++) line(ctx, left, yAt(row) + 0.5, right, yAt(row) + 0.5)
      ctx.stroke()
    }
    if (currentFont.grid > 1) {
      ctx.strokeStyle = "#7a7f8a80"
      ctx.beginPath()
      for (let x = currentFont.grid; x < columns.value; x += currentFont.grid) line(ctx, xAt(x) + 0.5, top, xAt(x) + 0.5, bottom)
      for (let row = 1; row <= rows.value; row++) {
        const y = yOfRow(currentFont, current, row)
        if (((y % currentFont.grid) + currentFont.grid) % currentFont.grid === currentFont.grid - 1) line(ctx, left, yAt(row) + 0.5, right, yAt(row) + 0.5)
      }
      ctx.stroke()
    }
    ctx.lineWidth = 2
    ctx.strokeStyle = "#2f7cf6"
    ctx.beginPath()
    line(ctx, left, topline, right, topline)
    ctx.stroke()
    ctx.strokeStyle = "#2dbb4f"
    ctx.beginPath()
    line(ctx, left, baseline, right, baseline)
    ctx.stroke()
    if (gutter < right + GUTTER_GAP) {
      ctx.fillStyle = backdrop
      ctx.fillRect(gutter - GUTTER_GAP, top, GUTTER_GAP, bottom - top)
    }
    ctx.fillStyle = "#2b2e35"
    ctx.fillRect(gutter, top, GUTTER, bottom - top)
    ctx.fillStyle = STRETCH_COLOUR
    for (const y of current.stretch) {
      const row = rowOfY(currentFont, current, y)
      ctx.fillRect(gutter, yAt(row), GUTTER, yAt(row + 1) - yAt(row))
    }
    if (hover.value) {
      const { column, row, across, down } = hover.value
      const x = hover.value.gutter ? gutter : xAt(column)
      ctx.strokeStyle = "#6cc04a"
      ctx.lineWidth = 2
      ctx.strokeRect(x, yAt(row), hover.value.gutter ? GUTTER : xAt(column + across) - x, yAt(row + down) - yAt(row))
    }
  }

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

  function wheel(event) {
    event.preventDefault()
    const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? available.value.height : 1
    zoomTo(view.value, view.value.cell * Math.exp(-event.deltaY * lines * (event.ctrlKey ? 0.01 : 0.0015)), local(event))
  }

  function applyStretch(row) {
    const next = setStretch(drawFont.value, stroke.base, clampRow(row), stroke.value)
    stroke.base = next
    strokeTo(setGlyph(font.value, selected.value, next))
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
      const cells = rectangleCells(drawFont.value, base, stroke.from, end)
      strokeTo(setGlyph(font.value, selected.value, paint(base, cells, stroke.value)))
      stroke.end = end
      return
    }
    if (shift && !stroke.constrain) Object.assign(stroke, { constrain: true, origin: stroke.from, axis: null })
    if (!shift) stroke.constrain = false
    const target = stroke.constrain ? constrained(point) : point
    const cells = lineCells(drawFont.value, stroke.latest, stroke.last ?? target, target)
    stroke.latest = paint(stroke.latest, cells, stroke.value)
    stroke.last = target
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
      const fill = () => updateGlyph(paint(glyph.value, fillCells(glyph.value, point.x, point.row), !erasing))
      if (event.pointerType === "touch") pendingFill = { pointerId: event.pointerId, fill }
      else fill()
      return
    }
    beginStroke()
    const shape = tool.value === "rectangle" ? "rectangle" : "pencil"
    stroke = { kind: "paint", base: glyph.value, latest: glyph.value, value: !erasing, from: point, last: null, end: null, shape, constrain: shape === "pencil" && event.shiftKey, origin: point, axis: null }
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
    const at = locate(event)
    if (stroke?.kind === "stretch") applyStretch(at.row)
    else if (stroke) applyPaint(at, event.shiftKey)
    updateHover(at)
  }

  function updateHover(at) {
    outside.value = !at.inside && !at.gutter
    if (stroke || spaceHeld.value || outside.value) {
      hover.value = null
      return
    }
    const block = blockAt(drawFont.value, glyph.value, at.gutter ? 0 : clampX(at.x), clampRow(at.row))
    const row = Math.min(...block.map(item => item.row))
    if (at.gutter) hover.value = { gutter: true, column: 0, row, across: 1, down: Math.max(...block.map(item => item.row)) - row + 1 }
    else hover.value = { gutter: false, column: Math.min(...block.map(item => item.x)), row, across: brush.value, down: brush.value }
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

  function release() {
    spaceHeld.value = false
  }

  function key(event) {
    const target = event.target
    if (event.ctrlKey || event.metaKey || event.altKey || typing(target) || (target instanceof HTMLElement && target.closest("[role=menu]"))) return
    const step = ARROWS[event.key]
    if (step && arrowsMove.value === "drawing") {
      event.preventDefault()
      moveSelected(step[0] * brush.value, step[1] * brush.value)
      return
    }
    if (event.key === "0") return fit()
    if (KEY_ZOOMS[event.key]) return zoomTo(view.value, view.value.cell * KEY_ZOOMS[event.key], middle())
    const found = TOOLS.find(item => item.key === event.key.toLowerCase())
    if (found) tool.value = found.id
  }

  function measure() {
    if (!holder.value) return
    available.value = { width: holder.value.clientWidth, height: holder.value.clientHeight }
    if (zoomed.value) zoomed.value = clampView(zoomed.value)
  }

  function clearGlyph() {
    updateGlyph({ ...glyph.value, rows: glyph.value.rows.map(row => "0".repeat(row.length)) }, null, NOTHING_OUTSIDE)
  }

  function flipX() {
    updateGlyph({ ...glyph.value, rows: glyph.value.rows.map(row => Array.from(row).reverse().join("")) }, null, NOTHING_OUTSIDE)
  }

  function flipY() {
    const current = glyph.value
    const top = current.above + font.value.height - 1
    updateGlyph({ ...current, rows: current.rows.slice().reverse(), stretch: current.stretch.map(y => top - current.below - y).sort((a, b) => a - b) }, null, NOTHING_OUTSIDE)
  }

  onMounted(() => {
    backdrop = getComputedStyle(holder.value).getPropertyValue("--bg").trim() || backdrop
    observer = new ResizeObserver(measure)
    observer.observe(holder.value)
    measure()
    addEventListener("keydown", key)
    addEventListener("keydown", shiftChanged)
    addEventListener("keyup", shiftChanged)
    addEventListener("keydown", spaceChanged)
    addEventListener("keyup", spaceChanged)
    addEventListener("blur", release)
    draw()
  })

  onBeforeUnmount(() => {
    observer.disconnect()
    removeEventListener("keydown", key)
    removeEventListener("keydown", shiftChanged)
    removeEventListener("keyup", shiftChanged)
    removeEventListener("keydown", spaceChanged)
    removeEventListener("keyup", spaceChanged)
    removeEventListener("blur", release)
    unblockMenu()
  })

  watch(selected, () => {
    anchor = null
    zoomed.value = null
  })
  watch([font, glyph, view, hover], draw, { flush: "post" })
</script>

<template>
  <section class="drawing">
    <div class="tools">
      <span class="group">
        <button v-for="item of TOOLS" :key="item.id" class="tool" :class="{ active: tool === item.id }" :title="`${item.label} (${item.key.toUpperCase()})${item.hint ? `. ${item.hint}` : ''}`" :aria-label="item.label" :aria-pressed="tool === item.id" @click="tool = item.id"><Icon :name="item.icon" :size="18" /></button>
      </span>
      <span v-if="brushes.length > 1" class="group density">
        <span class="group-label">Density</span>
        <button v-for="size of brushes" :key="size" class="small ghost" :class="{ active: brush === size }" :title="size === 1 ? 'Draw single pixels' : `Draw ${size} pixel blocks`" :aria-pressed="brush === size" @click="chosenBrush = size">{{ font.grid / size }}x</button>
      </span>
      <span class="group">
        <span class="group-label">Flip</span>
        <button class="tool flat" title="Flip left to right" aria-label="Flip left to right" @click="flipX"><Icon name="flipX" :size="18" /></button>
        <button class="tool flat" title="Flip upside down" aria-label="Flip upside down" @click="flipY"><Icon name="flipY" :size="18" /></button>
      </span>
      <span class="group">
        <button class="small ghost" title="Remove every pixel from this character" @click="clearGlyph">Clear</button>
      </span>
      <div class="spacer"></div>
      <button class="small ghost zoom" :disabled="!zoomed" title="Fit to view (0). Zoom with the mouse wheel or a pinch, and move around by dragging outside the character, with the middle mouse button, Space and drag, or two fingers" aria-label="Fit to view" @click="fit"><Icon name="fit" :size="16" />{{ zoomPercent }}%</button>
    </div>
    <div ref="holder" class="holder">
      <canvas ref="canvas" class="board" :class="{ grab: spaceHeld || outside, grabbing: panning }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @pointerenter="enter" @pointerleave="leave" @mousedown="noAutoscroll" @wheel="wheel" @contextmenu.prevent></canvas>
    </div>
    <p class="legend"><span class="key blue"></span>Topline <span class="key green"></span>Baseline <span class="key mark"></span>Stretch zone</p>
  </section>
</template>

<style scoped>
  .drawing {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg);
  }

  .tools {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
  }

  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .group + .group {
    padding-left: 8px;
    margin-left: 4px;
    border-left: 1px solid var(--line-strong);
  }

  .group-label {
    margin-right: 2px;
    font-size: var(--font-xs);
    color: var(--faint);
    user-select: none;
  }

  .tool {
    width: 34px;
    height: 34px;
    padding: 0;
    color: var(--muted);
    background: var(--card);
  }

  .tool.flat {
    background: transparent;
  }

  .tool:hover {
    color: var(--text);
    background: var(--card-hover);
  }

  .tools button.small {
    min-width: 34px;
    height: 34px;
  }

  .zoom {
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }

  .zoom:disabled {
    opacity: 0.6;
  }

  .zoom:disabled:hover {
    background: transparent;
  }

  .holder {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .board {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }

  .board.grab {
    cursor: grab;
  }

  .board.grabbing {
    cursor: grabbing;
  }

  .legend {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 0 12px 8px;
    font-size: var(--font-xs);
    color: var(--faint);
  }

  .key {
    display: inline-block;
    width: 14px;
    height: 3px;
    margin-left: 4px;
  }

  .key.blue {
    background: #2f7cf6;
  }

  .key.green {
    background: #2dbb4f;
  }

  .key.mark {
    width: 10px;
    height: 10px;
    background: #f59e0b;
  }

  @media (max-width: 1000px) {
    .holder {
      flex: none;
      height: 58svh;
      min-height: 280px;
    }
  }

  @media (max-width: 520px) {
    .density,
    .spacer,
    .zoom {
      order: 1;
    }

    .group.density {
      padding-left: 0;
      margin-left: 0;
      border-left: 0;
    }
  }
</style>
