<script setup>
import { computed, nextTick, ref, watch } from "vue"
import { hexOf, rgbOf } from "../lib/colour.js"
import { trackPointer, useWindowEvents } from "../lib/events.js"
import { clamp } from "../lib/maths.js"

const colour = defineModel({ type: String, required: true })

const open = ref(false)
const swatch = ref(null)
const popover = ref(null)
const position = ref({ left: 0, top: 0 })
const hsv = ref(toHsv(colour.value))
const text = ref(colour.value)

function toHsv(hex) {
  const [r, g, b] = rgbOf(hex).map(value => value / 255)
  const max = Math.max(r, g, b)
  const range = max - Math.min(r, g, b)
  let h = 0
  if (range) {
    if (max === r) h = ((g - b) / range + 6) % 6
    else if (max === g) h = (b - r) / range + 2
    else h = (r - g) / range + 4
  }
  return { h: h * 60, s: max ? range / max : 0, v: max }
}

function toHex({ h, s, v }) {
  function channel(n) {
    const k = (n + h / 60) % 6
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255
  }
  return hexOf([channel(5), channel(3), channel(1)])
}

const hue = computed(() => `hsl(${hsv.value.h}, 100%, 50%)`)

function commit() {
  const hex = toHex(hsv.value)
  text.value = hex
  if (hex !== colour.value) colour.value = hex
}

function drag(event, apply) {
  const target = event.currentTarget
  function move(moveEvent) {
    const rect = target.getBoundingClientRect()
    apply(clamp((moveEvent.clientX - rect.left) / rect.width, 0, 1), clamp((moveEvent.clientY - rect.top) / rect.height, 0, 1))
    commit()
  }
  move(event)
  trackPointer(move)
}

function pickArea(event) {
  drag(event, (x, y) => {
    hsv.value = { ...hsv.value, s: x, v: 1 - y }
  })
}

function pickHue(event) {
  drag(event, x => {
    hsv.value = { ...hsv.value, h: x * 359.9 }
  })
}

function typed() {
  const value = text.value.trim().replace(/^#?/, "#").toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(value)) return
  hsv.value = toHsv(value)
  colour.value = value
}

function outside(event) {
  if (!popover.value.contains(event.target) && !swatch.value.contains(event.target)) open.value = false
}

function escape(event) {
  if (event.key === "Escape") open.value = false
}

async function toggle() {
  open.value = !open.value
  if (!open.value) return
  hsv.value = toHsv(colour.value)
  text.value = colour.value
  await nextTick()
  const rect = swatch.value.getBoundingClientRect()
  const box = popover.value.getBoundingClientRect()
  const left = Math.min(rect.left, window.innerWidth - box.width - 8)
  const below = rect.bottom + 6
  const top = below + box.height > window.innerHeight - 8 ? rect.top - box.height - 6 : below
  position.value = { left: Math.max(8, left), top: Math.max(8, top) }
}

useWindowEvents(open, { keydown: escape }, { pointerdown: outside })

watch(colour, value => {
  if (value === toHex(hsv.value)) return
  hsv.value = toHsv(value)
  text.value = value
})
</script>

<template>
  <div class="field-colour">
    <button ref="swatch" class="colour field-button" :class="{ active: open }" @click="toggle" :title="colour">
      <span class="chip" :style="{ background: colour }"></span>
      <span class="hex">{{ colour }}</span>
    </button>
    <Teleport to="body">
      <div v-if="open" ref="popover" class="picker popover" :style="{ left: `${position.left}px`, top: `${position.top}px` }">
        <div class="area" :style="{ background: hue }" @pointerdown.prevent="pickArea">
          <div class="thumb" :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: colour }"></div>
        </div>
        <div class="hue" @pointerdown.prevent="pickHue">
          <div class="thumb" :style="{ left: `${hsv.h / 359.9 * 100}%`, background: hue }"></div>
        </div>
        <div class="row">
          <span class="chip big" :style="{ background: colour }"></span>
          <input type="text" v-model="text" @input="typed" spellcheck="false" maxlength="7">
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.field-colour {
  min-width: 0;
}

.colour {
  padding: 6px 12px 6px 6px;
}

.chip {
  flex: none;
  width: 26px;
  height: 26px;
  border: 1px solid #ffffff33;
}

.chip.big {
  width: 36px;
  height: 36px;
}

.hex {
  font-family: var(--mono);
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--muted);
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 240px;
  padding: 12px;
}

.area {
  position: relative;
  height: 160px;
  cursor: crosshair;
  touch-action: none;
}

.area::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
}

.hue {
  position: relative;
  height: 14px;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  cursor: pointer;
  touch-action: none;
}

.thumb {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 3px solid var(--knob);
  box-shadow: 0 0 0 1px #0008, var(--knob-shadow);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.hue .thumb {
  top: 50%;
}

.row input {
  font-family: var(--mono);
}
</style>
