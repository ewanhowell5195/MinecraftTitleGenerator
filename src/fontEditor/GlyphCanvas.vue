<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import { NOTHING_OUTSIDE } from "../lib/font/editor/glyphEditing.js"
  import Slider from "../components/Slider.vue"
  import { BASELINE_COLOUR, STRETCH_COLOUR, TOPLINE_COLOUR, useGlyphDrawing } from "./glyphDrawing.js"
  import { PICKER_CURSOR, useGlyphPointer } from "./glyphPointer.js"
  import { useGlyphView } from "./glyphView.js"
  import { arrowsMove, endStroke, font, glyph, moveSelected, pencilDepth, typing, updateGlyph } from "./store.js"

  const TOOLS = [
    { id: "pencil", icon: "pencil", label: "Pencil", key: "b", hint: "Shift-click draws a line from the last point, holding Shift while drawing keeps it horizontal or vertical" },
    { id: "eraser", icon: "eraser", label: "Eraser", key: "e", hint: "Right-click also erases, Shift works like the pencil" },
    { id: "rectangle", icon: "rectangle", label: "Rectangle", key: "r", hint: "Hold Shift for a square" },
    { id: "fill", icon: "fill", label: "Fill", key: "f" }
  ]
  const KEY_ZOOM = 1.25
  const TOOLTIP_GAP = 10
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
  const KEY_ZOOMS = { "+": KEY_ZOOM, "=": KEY_ZOOM, "-": 1 / KEY_ZOOM }

  const tool = ref("pencil")
  const holder = ref(null)
  const canvas = ref(null)
  const tools = ref(null)
  const toolGap = ref(TOOLTIP_GAP)

  function measureGap(event) {
    const trigger = event.target.closest("button, .depth")
    if (trigger && tools.value) toolGap.value = tools.value.getBoundingClientRect().bottom - trigger.getBoundingClientRect().bottom + TOOLTIP_GAP
  }

  function toolTip(text) {
    return { text, tooltipClass: "slow", prefer: "below", tooltipStyle: { "--easy-tooltip-distance": `${toolGap.value}px` } }
  }
  const chosenBrush = ref(null)
  let observer = null

  const brushes = computed(() => Array.from({ length: font.value.grid }, (_, index) => font.value.grid - index).filter(size => font.value.grid % size === 0))
  const brush = computed(() => brushes.value.includes(chosenBrush.value) ? chosenBrush.value : font.value.grid)
  const drawFont = computed(() => ({ ...font.value, grid: brush.value }))

  const glyphView = useGlyphView()
  const { available, zoomed, view, zoomPercent, clampView, zoomTo, fit, middle } = glyphView
  const { hover, spaceHeld, altHeld, panning, outside, down, move, up, enter, leave, noAutoscroll, wheel, shiftChanged, spaceChanged, altChanged, release, unblockMenu } = useGlyphPointer({ canvas, tool, brush, drawFont }, glyphView)
  const { draw, readTheme } = useGlyphDrawing(canvas, hover, glyphView)

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
    const { clientWidth: width, clientHeight: height } = holder.value
    const ratio = devicePixelRatio || 1
    available.value = { width, height }
    canvas.value.width = Math.round(width * ratio)
    canvas.value.height = Math.round(height * ratio)
    if (zoomed.value) zoomed.value = clampView(zoomed.value)
    draw()
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
    readTheme(holder.value)
    observer = new ResizeObserver(measure)
    observer.observe(holder.value)
    measure()
    addEventListener("keydown", key)
    addEventListener("keydown", shiftChanged)
    addEventListener("keyup", shiftChanged)
    addEventListener("keydown", spaceChanged)
    addEventListener("keyup", spaceChanged)
    addEventListener("keydown", altChanged)
    addEventListener("keyup", altChanged)
    addEventListener("blur", release)
  })

  onBeforeUnmount(() => {
    endStroke()
    observer.disconnect()
    removeEventListener("keydown", key)
    removeEventListener("keydown", shiftChanged)
    removeEventListener("keyup", shiftChanged)
    removeEventListener("keydown", spaceChanged)
    removeEventListener("keyup", spaceChanged)
    removeEventListener("keydown", altChanged)
    removeEventListener("keyup", altChanged)
    removeEventListener("blur", release)
    unblockMenu()
  })

  watch([font, glyph, view, hover], draw, { flush: "post" })
</script>

<template>
  <section class="drawing">
    <div ref="tools" class="tools" @pointerover="measureGap" @focusin="measureGap">
      <span class="group">
        <Button ghost :active="tool === item.id" v-for="item of TOOLS" :key="item.id" v-tooltip="toolTip(`${item.label} (${item.key.toUpperCase()})${item.hint ? `. ${item.hint}` : ''}`)" :aria-label="item.label" :aria-pressed="tool === item.id" @click="tool = item.id"><template #icon><Icon :name="item.icon" :size="16" /></template></Button>
      </span>
      <span v-if="brushes.length > 1" class="group density">
        <span class="group-label">Density</span>
        <Button ghost :active="brush === size" v-for="size of brushes" :key="size" v-tooltip="toolTip(size === 1 ? 'Draw single pixels' : `Draw ${size} pixel blocks`)" :aria-pressed="brush === size" @click="chosenBrush = size">{{ font.grid / size }}x</Button>
      </span>
      <span class="group depth" v-tooltip="toolTip('How far forward the pencil draws. Lower depths sit at the back of the letter. Hold Alt and click the character to pick a depth')">
        <Slider inline label="Depth" :min="12.5" :max="100" :step="12.5" :typed-min="1" v-model="pencilDepth" />
      </span>
      <span class="group">
        <span class="group-label">Flip</span>
        <Button ghost v-tooltip="toolTip('Flip left to right')" aria-label="Flip left to right" @click="flipX"><template #icon><Icon name="flipX" :size="16" /></template></Button>
        <Button ghost v-tooltip="toolTip('Flip upside down')" aria-label="Flip upside down" @click="flipY"><template #icon><Icon name="flipY" :size="16" /></template></Button>
      </span>
      <span class="group">
        <Button ghost @click="clearGlyph">Clear</Button>
      </span>
      <div class="spacer"></div>
      <Button ghost class="zoom" :disabled="!zoomed" v-tooltip="toolTip('Fit to view (0). Zoom with the mouse wheel or a pinch, and move around by dragging outside the character, with the middle mouse button, Space and drag, or two fingers')" aria-label="Fit to view" @click="fit"><template #icon><Icon name="fit" :size="16" /></template>{{ zoomPercent }}%</Button>
    </div>
    <div ref="holder" class="holder">
      <canvas ref="canvas" class="board" :class="{ grab: spaceHeld || outside, grabbing: panning }" :style="altHeld && !spaceHeld && !outside && !panning ? { cursor: PICKER_CURSOR } : null" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @pointerenter="enter" @pointerleave="leave" @mousedown="noAutoscroll" @wheel="wheel" @contextmenu.prevent></canvas>
    </div>
    <p class="legend" :style="{ '--topline': TOPLINE_COLOUR, '--baseline': BASELINE_COLOUR, '--stretch': STRETCH_COLOUR }"><span class="key blue"></span>Topline <span class="key green"></span>Baseline <span class="key mark"></span>Stretch zone</p>
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

  .depth {
    width: 220px;
  }

  .depth :deep(.slider.inline) {
    flex: 1;
    grid-template-columns: auto 1fr auto;
  }

  .depth :deep(.value) {
    width: 56px;
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

  .zoom {
    gap: 6px;
    font-variant-numeric: tabular-nums;
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
    background: var(--topline);
  }

  .key.green {
    background: var(--baseline);
  }

  .key.mark {
    width: 10px;
    height: 10px;
    background: var(--stretch);
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
