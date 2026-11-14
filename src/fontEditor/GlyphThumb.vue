<script setup>
  import { onMounted, ref, watch } from "vue"
  import { depthOf, widthOf } from "../lib/fontEditor.js"

  const WIDTH = 44
  const HEIGHT = 40
  const FILL = 0.7

  const props = defineProps({
    font: { type: Object, required: true },
    glyph: { type: Object, required: true }
  })

  const canvas = ref(null)

  function draw() {
    const { rows, above } = props.glyph
    const element = canvas.value
    const ratio = devicePixelRatio || 1
    element.width = WIDTH * ratio
    element.height = HEIGHT * ratio
    const ctx = element.getContext("2d")
    const scale = Math.min(HEIGHT * FILL / props.font.height, WIDTH * FILL / props.font.width) * ratio
    const inked = rows.filter(text => /[^0]/.test(text))
    const first = inked.length ? Math.min(...inked.map(text => text.search(/[^0]/))) : 0
    const columns = inked.length ? Math.max(...inked.map(text => text.length - text.match(/0*$/)[0].length)) - first : widthOf(props.font, props.glyph)
    const art = new OffscreenCanvas(Math.max(1, columns), Math.max(1, rows.length))
    const artCtx = art.getContext("2d")
    artCtx.fillStyle = "#ffffff1a"
    artCtx.fillRect(0, 0, art.width, art.height)
    rows.forEach((text, row) => {
      for (let x = first; x < text.length; x++) {
        if (text[x] === "0") continue
        const value = Math.round(255 * depthOf(props.font, text[x]))
        artCtx.fillStyle = `rgb(${value}, ${value}, ${value})`
        artCtx.fillRect(x - first, row, 1, 1)
      }
    })
    const left = Math.round((element.width - columns * scale) / 2)
    const top = Math.round((element.height - props.font.height * scale) / 2 - above * scale)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(art, left, top, Math.round(columns * scale), Math.round(rows.length * scale))
  }

  onMounted(draw)
  watch([() => props.font.height, () => props.font.width, () => props.glyph], draw)
</script>

<template>
  <canvas ref="canvas" class="thumb"></canvas>
</template>

<style scoped>
  .thumb {
    display: block;
    width: 44px;
    height: 40px;
  }
</style>
