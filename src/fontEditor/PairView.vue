<script setup>
  import { onMounted, ref, watch } from "vue"
  import { drawText } from "./textCanvas.js"

  const props = defineProps({
    parsed: { type: Object, required: true },
    pair: { type: String, required: true },
    amount: { type: Number, required: true },
    width: { type: Number, default: 112 },
    height: { type: Number, default: 52 },
    maxScale: { type: Number, default: 4 }
  })

  const canvas = ref(null)

  function draw() {
    drawText(canvas.value, { ...props.parsed, kerning: { [props.pair]: props.amount } }, props.pair, { maxWidth: props.width, maxHeight: props.height, maxScale: props.maxScale, raw: true })
  }

  onMounted(draw)
  watch(() => [props.parsed, props.pair, props.amount, props.width, props.height, props.maxScale], draw)
</script>

<template>
  <canvas ref="canvas" class="pair-canvas"></canvas>
</template>

<style scoped>
  .pair-canvas {
    display: block;
    image-rendering: pixelated;
  }
</style>
