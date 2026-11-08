<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue"
  import Slider from "../components/Slider.vue"
  import RenderView from "./RenderView.vue"
  import { previewFont, drawText } from "./textCanvas.js"
  import { font } from "./store.js"

  const SPLIT_WIDTH = 640
  const DRAW_DELAY = 40
  const EMPTY = "Nothing to show yet. Draw the characters in your preview text."

  const text = ref("minecraft")
  const terminators = ref(false)
  const stretch = ref(1)
  const canvas = ref(null)
  const holder = ref(null)
  const views = ref(null)
  const empty = ref(false)
  const error = ref("")
  const wide = ref(true)
  const mode = ref("2d")
  const request = computed(() => wide.value || mode.value === "3d" ? { font: toRaw(font.value), text: text.value, terminators: terminators.value, stretch: stretch.value } : null)
  let observer = null
  let timer = null

  function measure() {
    wide.value = views.value.clientWidth >= SPLIT_WIDTH
    schedule()
  }

  function draw() {
    if (!canvas.value || !holder.value) return
    try {
      empty.value = !drawText(canvas.value, previewFont(font.value), text.value, { maxWidth: holder.value.clientWidth - 16, maxHeight: holder.value.clientHeight - 16, terminators: terminators.value })
      error.value = ""
    } catch (err) {
      error.value = err.message
    }
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(draw, DRAW_DELAY)
  }

  onMounted(() => {
    observer = new ResizeObserver(measure)
    observer.observe(views.value)
    measure()
    draw()
  })

  onBeforeUnmount(() => {
    observer.disconnect()
    clearTimeout(timer)
  })

  watch([font, text, terminators, mode], schedule)
  watch(stretch, value => {
    if (value !== 1 && !wide.value) mode.value = "3d"
  })
</script>

<template>
  <section class="preview">
    <div class="bar">
      <label class="text">
        <span class="label">Preview</span>
        <input v-model="text" type="text" placeholder="Type something" aria-label="Preview text">
      </label>
      <div class="stretch" title="Makes the 3D preview taller using only the marked stretch zones">
        <Slider inline label="Stretch" :min="1" :max="3" :step="0.05" v-model="stretch" />
      </div>
      <label class="checkbox" :title="font.forcedTerminators ? 'This font always uses terminators' : 'Add the ┫ ┣ line terminators'">
        <input type="checkbox" :checked="terminators || font.forcedTerminators" :disabled="font.forcedTerminators" @change="terminators = $event.target.checked">
        <span>Terminators</span>
      </label>
    </div>
    <div ref="views" class="views" :class="{ split: wide }">
      <div v-show="wide || mode === '2d'" ref="holder" class="view">
        <canvas ref="canvas" v-show="!empty && !error"></canvas>
        <p v-if="error" class="message bad">{{ error }}</p>
        <p v-else-if="empty" class="message">{{ EMPTY }}</p>
      </div>
      <RenderView v-show="request" class="view" :request="request" :empty="EMPTY" />
      <button v-if="!wide" class="small mode-switch" :title="mode === '2d' ? 'Show the 3D preview' : 'Show the flat preview'" @click="mode = mode === '2d' ? '3d' : '2d'">{{ mode === "2d" ? "3D" : "2D" }}</button>
    </div>
  </section>
</template>

<style scoped>
  .preview {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px 12px;
    background: var(--surface);
    border-top: 1px solid var(--line);
  }

  .text {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .text input {
    padding: 6px 10px;
    font-size: var(--font-md);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .bar .text {
    flex: 1;
    min-width: 0;
  }

  .stretch {
    flex: none;
    width: 260px;
  }

  .stretch :deep(.slider.inline) {
    grid-template-columns: auto 1fr auto;
  }

  .views {
    position: relative;
    display: grid;
    gap: 8px;
  }

  .views.split {
    grid-template-columns: 1fr 1fr;
  }

  .view {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    height: 110px;
    overflow: hidden;
    background: var(--checker);
  }

  .mode-switch {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 40px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    box-shadow: 0 2px 6px #0008;
    user-select: none;
  }

  .mode-switch:hover {
    background: var(--card-hover);
  }

  canvas {
    display: block;
    image-rendering: pixelated;
  }

  .message {
    margin: 0;
    padding: 0 12px;
    font-size: var(--font-md);
    text-align: center;
    color: var(--muted);
  }

  .bad {
    color: var(--danger);
  }

  @media (max-width: 800px) {
    .text input {
      font-size: 16px;
    }

    .bar {
      flex-wrap: wrap;
      row-gap: 10px;
    }

    .bar .text {
      flex-basis: 100%;
    }

    .stretch {
      flex: 1;
      width: auto;
      min-width: 0;
    }
  }
</style>
