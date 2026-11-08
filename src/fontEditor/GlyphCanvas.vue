<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import Icon from "../components/Icon.vue"
  import { blockAt, characterName, fillCells, lineCells, paint, rectangleCells, rowOfY, setGlyph, setStretch, shiftGlyph, widthOf, yOfRow } from "../lib/fontEditor.js"
  import { arrowsMove, beginStroke, font, glyph, selected, strokeTo, updateGlyph } from "./store.js"

  const TOOLS = [
    { id: "pencil", icon: "pencil", label: "Pencil", key: "b", hint: "Shift-click draws a line from the last point, holding Shift while drawing keeps it horizontal or vertical" },
    { id: "eraser", icon: "eraser", label: "Eraser", key: "e", hint: "Right-click also erases, Shift works like the pencil" },
    { id: "rectangle", icon: "rectangle", label: "Rectangle", key: "r", hint: "Hold Shift for a square" },
    { id: "fill", icon: "fill", label: "Fill", key: "f" }
  ]
  const GUTTER_GAP = 6
  const GUTTER = 18
  const PADDING = 2
  const MAX_CELL = 40
  const MIN_CELL = 3
  const STRETCH_COLOUR = "#f59e0b"
  const GUIDE_FONT = "Arial, sans-serif"
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
  const GUIDES = { "\u{1F633}": "", "\u{1F629}": "\u2018", "'": "\u2019" }

  const tool = ref("pencil")
  const holder = ref(null)
  const canvas = ref(null)
  const available = ref({ width: 300, height: 300 })
  const hover = ref(null)
  const chosenBrush = ref(null)
  let stroke = null
  let anchor = null
  let lastAt = null
  let observer = null

  const brushes = computed(() => Array.from({ length: font.value.grid }, (_, index) => font.value.grid - index).filter(size => font.value.grid % size === 0))
  const brush = computed(() => brushes.value.includes(chosenBrush.value) ? chosenBrush.value : font.value.grid)
  const drawFont = computed(() => ({ ...font.value, grid: brush.value }))
  const columns = computed(() => widthOf(font.value, glyph.value))
  const rows = computed(() => glyph.value.rows.length)
  const cell = computed(() => {
    const fit = (across, down) => Math.min((available.value.width - GUTTER - GUTTER_GAP - PADDING * 2) / across, (available.value.height - PADDING * 2) / down)
    const size = Math.min(fit(font.value.width, font.value.height), fit(columns.value, rows.value))
    return Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(size)))
  })
  const gutterX = computed(() => PADDING + columns.value * cell.value + GUTTER_GAP)
  const size = computed(() => ({ width: gutterX.value + GUTTER + PADDING, height: rows.value * cell.value + PADDING * 2 }))

  function drawGuide(ctx, baseline, capHeight, width) {
    const text = GUIDES[selected.value] ?? selected.value.toUpperCase()
    if (!text.trim()) return
    ctx.save()
    ctx.font = `bold 100px ${GUIDE_FONT}`
    const capRatio = ctx.measureText("H").actualBoundingBoxAscent / 100
    ctx.font = `bold ${capHeight / capRatio}px ${GUIDE_FONT}`
    const measured = ctx.measureText(text)
    const textWidth = measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight
    const below = Math.max(0, measured.actualBoundingBoxDescent)
    const scale = Math.min(1, width * 0.9 / textWidth, capHeight / (measured.actualBoundingBoxAscent + below))
    ctx.translate(PADDING + width / 2, baseline - below * scale)
    ctx.scale(scale, scale)
    ctx.fillStyle = "#2f7cf659"
    ctx.fillText(text, (measured.actualBoundingBoxLeft - measured.actualBoundingBoxRight) / 2, 0)
    ctx.restore()
  }

  function draw() {
    const element = canvas.value
    if (!element) return
    const { width, height } = size.value
    const ratio = devicePixelRatio || 1
    element.width = width * ratio
    element.height = height * ratio
    element.style.width = `${width}px`
    element.style.height = `${height}px`
    const ctx = element.getContext("2d")
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    const c = cell.value
    const current = glyph.value
    const currentFont = font.value
    const totalWidth = columns.value * c
    ctx.fillStyle = "#fff"
    ctx.fillRect(PADDING, PADDING, totalWidth, rows.value * c)
    ctx.fillStyle = "#dfe8f2"
    if (current.above) ctx.fillRect(PADDING, PADDING, totalWidth, current.above * c)
    if (current.below) ctx.fillRect(PADDING, PADDING + (current.above + currentFont.height) * c, totalWidth, current.below * c)
    drawGuide(ctx, PADDING + (current.above + currentFont.height) * c, currentFont.height * c, totalWidth)
    ctx.fillStyle = "#000"
    current.rows.forEach((text, row) => {
      for (let x = 0; x < text.length; x++) if (text[x] === "1") ctx.fillRect(PADDING + x * c, PADDING + row * c, c, c)
    })
    if (c >= 8) {
      ctx.strokeStyle = "#8888882e"
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 1; x < columns.value; x++) {
        ctx.moveTo(PADDING + x * c + 0.5, PADDING)
        ctx.lineTo(PADDING + x * c + 0.5, PADDING + rows.value * c)
      }
      for (let row = 1; row < rows.value; row++) {
        ctx.moveTo(PADDING, PADDING + row * c + 0.5)
        ctx.lineTo(PADDING + totalWidth, PADDING + row * c + 0.5)
      }
      ctx.stroke()
    }
    if (currentFont.grid > 1) {
      ctx.strokeStyle = "#7a7f8a80"
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = currentFont.grid; x < columns.value; x += currentFont.grid) {
        ctx.moveTo(PADDING + x * c + 0.5, PADDING)
        ctx.lineTo(PADDING + x * c + 0.5, PADDING + rows.value * c)
      }
      for (let row = 0; row <= rows.value; row++) {
        const y = yOfRow(currentFont, current, row)
        if (row === 0 || ((y % currentFont.grid) + currentFont.grid) % currentFont.grid !== currentFont.grid - 1) continue
        ctx.moveTo(PADDING, PADDING + row * c + 0.5)
        ctx.lineTo(PADDING + totalWidth, PADDING + row * c + 0.5)
      }
      ctx.stroke()
    }
    const topline = PADDING + current.above * c
    const baseline = PADDING + (current.above + currentFont.height) * c
    ctx.lineWidth = 2
    ctx.strokeStyle = "#2f7cf6"
    ctx.beginPath()
    ctx.moveTo(PADDING, topline)
    ctx.lineTo(PADDING + totalWidth, topline)
    ctx.stroke()
    ctx.strokeStyle = "#2dbb4f"
    ctx.beginPath()
    ctx.moveTo(PADDING, baseline)
    ctx.lineTo(PADDING + totalWidth, baseline)
    ctx.stroke()
    ctx.fillStyle = "#2b2e35"
    ctx.fillRect(gutterX.value, PADDING, GUTTER, rows.value * c)
    ctx.fillStyle = STRETCH_COLOUR
    for (const y of current.stretch) ctx.fillRect(gutterX.value, PADDING + rowOfY(currentFont, current, y) * c, GUTTER, c)
    if (hover.value) {
      ctx.strokeStyle = "#6cc04a"
      ctx.lineWidth = 2
      ctx.strokeRect(hover.value.x, hover.value.y, hover.value.width, hover.value.height)
    }
  }

  function locate(event) {
    const box = canvas.value.getBoundingClientRect()
    const px = event.clientX - box.left
    const py = event.clientY - box.top
    return { gutter: px >= gutterX.value - GUTTER_GAP, x: Math.floor((px - PADDING) / cell.value), row: Math.floor((py - PADDING) / cell.value) }
  }

  function clampRow(row) {
    return Math.max(0, Math.min(rows.value - 1, row))
  }

  function clampX(x) {
    return Math.max(0, Math.min(columns.value - 1, x))
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

  function down(event) {
    if (event.button !== 0 && event.button !== 2) return
    event.preventDefault()
    const at = locate(event)
    const erasing = event.button === 2 || tool.value === "eraser"
    canvas.value.setPointerCapture(event.pointerId)
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
      updateGlyph(paint(glyph.value, fillCells(glyph.value, point.x, point.row), !erasing))
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
    const at = locate(event)
    if (stroke) {
      if (stroke.kind === "stretch") applyStretch(at.row)
      else applyPaint(at, event.shiftKey)
    }
    updateHover(at, event)
  }

  function updateHover(at) {
    if (stroke || at.row < 0 || at.row >= rows.value) {
      hover.value = null
      return
    }
    if (at.gutter) {
      const block = blockAt(drawFont.value, glyph.value, 0, at.row)
      const rowsCovered = block.map(item => item.row)
      const c = cell.value
      hover.value = { x: gutterX.value, y: PADDING + Math.min(...rowsCovered) * c, width: GUTTER, height: (Math.max(...rowsCovered) - Math.min(...rowsCovered) + 1) * c }
      return
    }
    if (at.x < 0 || at.x >= columns.value) {
      hover.value = null
      return
    }
    const block = blockAt(drawFont.value, glyph.value, at.x, at.row)
    const c = cell.value
    const left = Math.min(...block.map(item => item.x))
    const top = Math.min(...block.map(item => item.row))
    hover.value = { x: PADDING + left * c, y: PADDING + top * c, width: brush.value * c, height: brush.value * c }
  }

  function up() {
    if (stroke?.kind === "paint" && stroke.shape !== "rectangle") anchor = stroke.end ?? stroke.last
    stroke = null
  }

  function shiftChanged(event) {
    if (event.key !== "Shift" || stroke?.kind !== "paint" || !lastAt) return
    applyPaint(lastAt, event.type === "keydown")
  }

  function leave() {
    if (!stroke) hover.value = null
  }

  function key(event) {
    const target = event.target
    if (event.ctrlKey || event.metaKey || event.altKey || (target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=menu]")))) return
    const step = ARROWS[event.key]
    if (step && arrowsMove.value === "drawing") {
      event.preventDefault()
      const moved = shiftGlyph(glyph.value, step[0] * brush.value, step[1] * brush.value)
      if (moved) updateGlyph(moved, `${selected.value}.move`)
      return
    }
    const found = TOOLS.find(item => item.key === event.key.toLowerCase())
    if (found) tool.value = found.id
  }

  function measure() {
    if (!holder.value) return
    available.value = { width: holder.value.clientWidth, height: holder.value.clientHeight }
  }

  function clearGlyph() {
    updateGlyph({ ...glyph.value, rows: glyph.value.rows.map(row => "0".repeat(row.length)) })
  }

  function flipX() {
    updateGlyph({ ...glyph.value, rows: glyph.value.rows.map(row => Array.from(row).reverse().join("")) })
  }

  function flipY() {
    const current = glyph.value
    const top = current.above + font.value.height - 1
    updateGlyph({ ...current, rows: current.rows.slice().reverse(), stretch: current.stretch.map(y => top - current.below - y).sort((a, b) => a - b) })
  }

  onMounted(() => {
    observer = new ResizeObserver(measure)
    observer.observe(holder.value)
    measure()
    addEventListener("keydown", key)
    addEventListener("keydown", shiftChanged)
    addEventListener("keyup", shiftChanged)
    draw()
  })

  onBeforeUnmount(() => {
    observer.disconnect()
    removeEventListener("keydown", key)
    removeEventListener("keydown", shiftChanged)
    removeEventListener("keyup", shiftChanged)
  })

  watch(selected, () => {
    anchor = null
  })
  watch([font, glyph, cell, hover, selected, size], draw, { flush: "post" })
</script>

<template>
  <section class="drawing" @pointerdown="arrowsMove = 'drawing'">
    <div class="tools">
      <button v-for="item of TOOLS" :key="item.id" class="tool" :class="{ active: tool === item.id }" :title="`${item.label} (${item.key.toUpperCase()})${item.hint ? `. ${item.hint}` : ''}`" :aria-label="item.label" :aria-pressed="tool === item.id" @click="tool = item.id"><Icon :name="item.icon" :size="18" /></button>
      <template v-if="brushes.length > 1">
        <span class="divider"></span>
        <span class="group">
          <span class="group-label">Density</span>
          <button v-for="size of brushes" :key="size" class="small ghost" :class="{ active: brush === size }" :title="size === 1 ? 'Draw single pixels' : `Draw ${size} pixel blocks`" :aria-pressed="brush === size" @click="chosenBrush = size">{{ font.grid / size }}x</button>
        </span>
      </template>
      <span class="divider"></span>
      <span class="group">
        <span class="group-label">Flip</span>
        <button class="tool small-tool" title="Flip left to right" aria-label="Flip left to right" @click="flipX"><Icon name="flipX" :size="18" /></button>
        <button class="tool small-tool" title="Flip upside down" aria-label="Flip upside down" @click="flipY"><Icon name="flipY" :size="18" /></button>
      </span>
      <span class="divider"></span>
      <button class="small ghost" title="Remove every pixel from this character" @click="clearGlyph">Clear</button>
      <div class="spacer"></div>
      <span class="what">{{ characterName(selected) }}</span>
    </div>
    <div ref="holder" class="holder">
      <canvas ref="canvas" class="board" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @pointerleave="leave" @contextmenu.prevent></canvas>
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
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
  }

  .tool {
    width: 36px;
    height: 36px;
    padding: 0;
    color: var(--muted);
    background: var(--card);
  }

  .tool.small-tool {
    width: 30px;
    height: 30px;
    background: transparent;
  }

  .tool:hover {
    color: var(--text);
    background: var(--card-hover);
  }

  .divider {
    width: 1px;
    height: 22px;
    margin: 0 6px;
    background: var(--line-strong);
  }

  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .group-label {
    margin-right: 2px;
    font-size: var(--font-xs);
    color: var(--faint);
  }

  .what {
    font-size: var(--font-md);
    font-weight: 600;
    color: var(--muted);
  }

  .holder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: auto;
    margin: 12px;
  }

  .board {
    display: block;
    flex: none;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
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
      height: 62vh;
      flex: none;
    }
  }
</style>
