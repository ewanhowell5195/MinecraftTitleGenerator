<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue"
import { frameRect, frameSplit, framing } from "../lib/framing.js"
import { cssGradient } from "../lib/material.js"
import { view, viewport, viewportChanges } from "../lib/view.js"

const title = shallowRef(null)
const mirror = ref(null)
let frame = 0

function measure() {
  frame = 0
  title.value = viewport.titleRect()
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(measure)
}

function pixels(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, `${value}px`]))
}

const rect = computed(() => title.value && pixels(frameRect(title.value)))
const split = computed(() => title.value && frameSplit(title.value))

const fill = computed(() => {
  if (framing.tab === "minecraft") return framing.mode === "1.19" ? "url(render/legacy-title.png) 0 0 / 100% 100%" : null
  if (!framing.backgroundEnabled) return null
  return cssGradient(framing.backgroundStops, framing.backgroundSmooth, `${180 + framing.backgroundAngle}deg`)
})

function copy(source) {
  const target = mirror.value
  target.width = source.width
  target.height = source.height
  target.style.width = `${source.clientWidth}px`
  target.style.height = `${source.clientHeight}px`
  target.getContext("2d").drawImage(source, 0, 0)
}

function apply(value) {
  viewport.canvas.style.clipPath = value ? `inset(0 calc(100% - ${value.x}px) 0 0)` : ""
  viewport.mirror = value ? copy : null
  if (value) viewport.redraw()
}

watch(split, apply, { flush: "post" })
watch([viewportChanges, () => view.resolution, () => view.antialias], schedule)
onMounted(schedule)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  apply(null)
})
</script>

<template>
  <template v-if="rect">
    <div v-if="fill" class="fill" :style="{ ...rect, background: fill }"></div>
    <canvas v-if="split" ref="mirror" class="mirror" :style="{ left: `${split.shift[0]}px`, top: `${split.shift[1]}px`, clipPath: `inset(0 0 0 ${split.x}px)` }"></canvas>
    <div class="frame" :style="rect"></div>
  </template>
</template>

<style scoped>
.fill,
.frame,
.mirror {
  position: absolute;
  pointer-events: none;
}

.fill {
  z-index: 0;
  image-rendering: pixelated;
}

.mirror {
  z-index: 1;
}

.frame {
  z-index: 2;
  outline: 1px solid var(--line-strong);
  box-shadow: 0 0 0 100vmax #0000008c;
}
</style>
