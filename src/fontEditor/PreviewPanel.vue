<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue"
  import { renderFont } from "./render3d.js"
  import { previewFont, drawText } from "./textCanvas.js"
  import { font } from "./store.js"

  const SPLIT_WIDTH = 640
  const RENDER_DELAY = 50
  const MAX_RENDER_WIDTH = 1600

  const text = ref("minecraft")
  const terminators = ref(false)
  const canvas = ref(null)
  const holder = ref(null)
  const views = ref(null)
  const stage = ref(null)
  const empty = ref(false)
  const error = ref("")
  const wide = ref(true)
  const mode = ref("2d")
  const rendered = ref(false)
  const busy = ref(false)
  const error3d = ref("")
  const show3d = computed(() => wide.value || mode.value === "3d")
  let observer = null
  let timer = null
  let timer3d = null
  let rendering = false
  let again = false

  function measure() {
    wide.value = views.value.clientWidth >= SPLIT_WIDTH
    schedule()
  }

  function schedule3d() {
    clearTimeout(timer3d)
    timer3d = setTimeout(render3d, RENDER_DELAY)
  }

  async function render3d() {
    if (!show3d.value || !stage.value) return
    if (rendering) {
      again = true
      return
    }
    rendering = true
    busy.value = true
    try {
      const width = Math.min(MAX_RENDER_WIDTH, Math.round(stage.value.parentElement.clientWidth * (devicePixelRatio || 1) * 2))
      const result = await renderFont(toRaw(font.value), text.value, { terminators: terminators.value, width })
      stage.value?.replaceChildren(...(result ? [result] : []))
      rendered.value = !!result
      error3d.value = ""
    } catch (err) {
      stage.value?.replaceChildren()
      rendered.value = false
      error3d.value = err.message
    } finally {
      rendering = false
      busy.value = false
      if (again) {
        again = false
        render3d()
      }
    }
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
    timer = setTimeout(draw, 40)
  }

  onMounted(() => {
    observer = new ResizeObserver(measure)
    observer.observe(views.value)
    measure()
    draw()
    schedule3d()
  })

  onBeforeUnmount(() => {
    observer.disconnect()
    clearTimeout(timer)
    clearTimeout(timer3d)
  })

  watch([font, text, terminators], () => {
    schedule()
    schedule3d()
  })
  watch(show3d, schedule3d)
  watch(mode, schedule)
</script>

<template>
  <section class="preview">
    <div class="bar">
      <label class="text">
        <span class="label">Preview</span>
        <input v-model="text" type="text" placeholder="Type something" aria-label="Preview text">
      </label>
      <label class="checkbox" :title="font.forcedTerminators ? 'This font always uses terminators' : 'Add the ┫ ┣ line terminators'">
        <input type="checkbox" :checked="terminators || font.forcedTerminators" :disabled="font.forcedTerminators" @change="terminators = $event.target.checked">
        <span>Terminators</span>
      </label>
    </div>
    <div ref="views" class="views" :class="{ split: wide }">
      <div v-show="wide || mode === '2d'" ref="holder" class="view">
        <canvas ref="canvas" v-show="!empty && !error"></canvas>
        <p v-if="error" class="message bad">{{ error }}</p>
        <p v-else-if="empty" class="message">Nothing to show yet. Draw the characters in your preview text.</p>
      </div>
      <div v-show="show3d" class="view three" :class="{ busy }">
        <div ref="stage" class="stage"></div>
        <p v-if="error3d" class="message bad">{{ error3d }}</p>
        <p v-else-if="!rendered" class="message">{{ busy ? "Rendering..." : "Nothing to show yet. Draw the characters in your preview text." }}</p>
      </div>
      <button v-if="!wide" class="small switch" :title="mode === '2d' ? 'Show the 3D preview' : 'Show the flat preview'" @click="mode = mode === '2d' ? '3d' : '2d'">{{ mode === "2d" ? "3D" : "2D" }}</button>
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

  .checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-md);
    color: var(--muted);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }

  .checkbox input {
    margin: 0;
    accent-color: var(--accent);
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

  .stage {
    display: contents;
  }

  .stage :deep(canvas) {
    display: block;
    max-width: calc(100% - 16px);
    max-height: calc(100% - 16px);
    image-rendering: auto;
  }

  .three .message {
    position: absolute;
  }

  .three.busy .stage :deep(canvas) {
    opacity: 0.6;
  }

  .switch {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 40px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    box-shadow: 0 2px 6px #0008;
    user-select: none;
  }

  .switch:hover {
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
  }
</style>
