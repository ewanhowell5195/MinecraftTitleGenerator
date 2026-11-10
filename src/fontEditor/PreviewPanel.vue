<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import LiveTitle from "../components/LiveTitle.vue"
  import Slider from "../components/Slider.vue"
  import { editorLine, useServedFont } from "./editorLine.js"
  import { previewFont, drawText } from "./textCanvas.js"
  import { font, previewMode as mode, previewStretch as stretch, previewTerminators as terminators, previewText as text } from "./store.js"

  const SPLIT_WIDTH = 640
  const EMPTY = "Nothing to show yet. Draw the characters in your preview text."

  const canvas = ref(null)
  const holder = ref(null)
  const views = ref(null)
  const empty = ref(false)
  const error = ref("")
  const wide = ref(true)
  const live = computed(() => wide.value || mode.value === "3d")
  const { entry, settled } = useServedFont("preview", () => live.value ? { font: font.value } : null)
  const lines = computed(() => entry.value && text.value.trim() ? [editorLine(entry.value, text.value, { terminators: terminators.value, stretch: 1 + stretch.value / 100 })] : [])
  let observer = null
  let frame = 0

  function measure() {
    wide.value = views.value.clientWidth >= SPLIT_WIDTH
    schedule()
  }

  function draw() {
    if (!canvas.value || !holder.value) return
    try {
      empty.value = !drawText(canvas.value, previewFont(font.value), text.value, { maxWidth: holder.value.clientWidth - 16, maxHeight: holder.value.clientHeight - 16, terminators: terminators.value, stretch: 1 + stretch.value / 100 })
      error.value = ""
    } catch (err) {
      error.value = err.message
    }
  }

  function schedule() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      draw()
    })
  }

  onMounted(() => {
    observer = new ResizeObserver(measure)
    observer.observe(views.value)
    measure()
    draw()
  })

  onBeforeUnmount(() => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  })

  watch([font, text, terminators, mode, stretch], schedule)
</script>

<template>
  <section class="preview">
    <div class="bar">
      <label class="text">
        <span class="label">Preview</span>
        <input v-model="text" type="text" placeholder="Type something" aria-label="Preview text">
      </label>
      <div class="stretch" v-tooltip="'Makes the preview up to twice as tall, using only the marked stretch zones'">
        <Slider inline label="Stretch" :min="0" :max="100" v-model="stretch" />
      </div>
      <label class="checkbox" v-tooltip="font.forcedTerminators ? 'This font always uses terminators' : 'Add the ┫ ┣ line terminators'">
        <input type="checkbox" :checked="terminators || font.forcedTerminators" :disabled="font.forcedTerminators" @change="terminators = $event.target.checked">
        <span>Terminators</span>
      </label>
    </div>
    <div ref="views" class="views" :class="{ split: wide }">
      <div v-show="wide || mode === '2d'" ref="holder" class="view">
        <canvas ref="canvas" v-show="!empty && !error"></canvas>
        <p v-if="error" class="message bad">{{ error }}</p>
        <p v-else-if="empty" class="message empty-state">{{ EMPTY }}</p>
      </div>
      <LiveTitle v-if="live" class="view" :lines="lines" :fonts="[entry]" :message="EMPTY" @settled="settled" />
      <Button class="mode-switch" v-if="!wide" @click="mode = mode === '2d' ? '3d' : '2d'">{{ mode === "2d" ? "3D" : "2D" }}</Button>
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
    padding: 0 10px;
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

  .stretch :deep(.value) {
    width: 48px;
  }

  .stretch :deep(.value input) {
    text-align: left;
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
    aspect-ratio: auto;
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
    text-align: center;
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
