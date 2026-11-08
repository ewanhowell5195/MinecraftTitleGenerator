<script setup>
  import { onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { renderFont } from "./render3d.js"

  const RENDER_DELAY = 50
  const MAX_RENDER_WIDTH = 1600

  const props = defineProps({
    request: { type: Object, default: null },
    empty: { type: String, required: true }
  })

  const stage = ref(null)
  const busy = ref(false)
  const rendered = ref(false)
  const error = ref("")
  let timer = null
  let rendering = false
  let again = false

  async function render() {
    if (!stage.value || !props.request) return
    if (rendering) {
      again = true
      return
    }
    rendering = true
    busy.value = true
    try {
      const { font, text, ...options } = props.request
      const width = Math.min(MAX_RENDER_WIDTH, Math.round(stage.value.parentElement.clientWidth * (devicePixelRatio || 1) * 2))
      const result = await renderFont(font, text, { ...options, width })
      stage.value?.replaceChildren(...(result ? [result] : []))
      rendered.value = !!result
      error.value = ""
    } catch (err) {
      stage.value?.replaceChildren()
      rendered.value = false
      error.value = err.message
    } finally {
      rendering = false
      busy.value = false
      if (again) {
        again = false
        render()
      }
    }
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(render, RENDER_DELAY)
  }

  onMounted(schedule)
  onBeforeUnmount(() => clearTimeout(timer))
  watch([() => props.request?.font, () => props.request && JSON.stringify({ ...props.request, font: null })], schedule)
</script>

<template>
  <div class="render" :class="{ busy }">
    <div ref="stage" class="stage"></div>
    <p v-if="error" class="message bad">{{ error }}</p>
    <p v-else-if="!rendered" class="message">{{ busy ? "Rendering..." : empty }}</p>
  </div>
</template>

<style scoped>
  .render {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
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
  }

  .busy .stage :deep(canvas) {
    opacity: 0.6;
  }

  .message {
    position: absolute;
    margin: 0;
    padding: 0 12px;
    font-size: var(--font-md);
    text-align: center;
    color: var(--muted);
  }

  .bad {
    color: var(--danger);
  }
</style>
