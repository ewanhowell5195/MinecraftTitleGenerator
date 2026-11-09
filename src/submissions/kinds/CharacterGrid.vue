<script setup>
  import { computed, shallowRef, watch } from "vue"
  import { pixelsOf } from "../../lib/canvas.js"
  import { loadImage, sheetLayout } from "../../lib/font.js"
  import { characterName, exportJson, flatTexture, parsedSheet } from "../../lib/fontEditor.js"
  import { defaultBorder, defaultDepth } from "../../lib/settings.js"
  import { submittedFont } from "../../lib/submissionKinds/fontBuild.js"

  const TILE_HEIGHT = 72

  const props = defineProps({
    url: { type: String, required: true },
    texture: { type: Object, default: null }
  })

  const drawn = shallowRef(null)
  const sheet = shallowRef(null)
  const problem = shallowRef("")

  const span = computed(() => {
    if (!drawn.value?.cells.length) return null
    const top = Math.max(...drawn.value.cells.map(cell => cell.top))
    const bottom = Math.min(...drawn.value.cells.map(cell => cell.bottom))
    return { top, bottom, scale: TILE_HEIGHT / (top - bottom) }
  })

  const tiles = computed(() => drawn.value && span.value ? drawn.value.cells.map(cell => ({ char: cell.char, image: glyphImage(cell), style: { width: `${cell.width * span.value.scale}px`, height: `${cell.height * span.value.scale}px`, top: `${(span.value.top - cell.top) * span.value.scale}px` } })) : [])

  function pixel(image, x, y) {
    const at = (y * image.width + x) * 4
    return Array.from(image.data.subarray(at, at + 4))
  }

  function overlaid(base, top) {
    const alpha = top[3] / 255
    const mixed = base.slice(0, 3).map((value, index) => {
      const b = value / 255
      const o = top[index] / 255
      const blended = b < 0.5 ? 2 * b * o : 1 - 2 * (1 - b) * (1 - o)
      return Math.round((b * (1 - alpha) + blended * alpha) * 255)
    })
    return mixed.concat(base[3])
  }

  function densityOf(source) {
    const { flat, depth } = drawn.value
    const exact = source.kind === "strip" ? source.height / (depth * 2 + span.value.top - span.value.bottom) : source.width / flat.width
    return Math.max(1, Math.round(exact))
  }

  function colourAt(cell, at, ox, oy, density) {
    const { flat, depth } = drawn.value
    const source = sheet.value
    const cx = Math.floor(ox / density)
    const cy = Math.floor(oy / density)
    const base = pixel(flat, at.x + cx, at.top + cy)
    if (!source) return base
    if (source.kind === "strip") return pixel(source, ox % source.width, (depth + span.value.top - cell.top + cy) * density + oy % density)
    const painted = pixel(source, at.x * density + ox, at.top * density + oy)
    return source.kind === "overlay" ? overlaid(base, painted) : painted
  }

  function glyphImage(cell) {
    const at = drawn.value.positions.get(cell)
    const density = sheet.value ? densityOf(sheet.value) : 1
    const width = cell.width * density
    const height = cell.height * density
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    const image = ctx.createImageData(width, height)
    for (let oy = 0; oy < height; oy++) {
      for (let ox = 0; ox < width; ox++) {
        if (cell.mask[(cell.height - 1 - Math.floor(oy / density)) * cell.width + Math.floor(ox / density)]) image.data.set(colourAt(cell, at, ox, oy, density), (oy * width + ox) * 4)
      }
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL()
  }

  watch(() => props.url, async url => {
    drawn.value = null
    problem.value = ""
    try {
      const font = submittedFont(new Uint8Array(await (await fetch(url)).arrayBuffer())).font
      if (url !== props.url) return
      const entry = exportJson(font, "")
      const depth = defaultDepth(entry)
      const { list, capHeight } = parsedSheet(font, defaultBorder("top", entry))
      drawn.value = { cells: list.filter(cell => cell.width), blank: list.filter(cell => !cell.width).map(cell => cell.char), positions: sheetLayout(list, capHeight, depth), depth, flat: flatTexture(font) }
    } catch (err) {
      problem.value = err.message
    }
  }, { immediate: true })

  watch(() => props.texture, async texture => {
    if (!texture) {
      sheet.value = null
      return
    }
    try {
      const image = await loadImage(texture.url)
      if (texture === props.texture) sheet.value = { kind: texture.kind, width: image.width, height: image.height, data: pixelsOf(image) }
    } catch (err) {
      problem.value = `The texture couldn't be loaded: ${err.message}`
    }
  }, { immediate: true })
</script>

<template>
  <div class="flow">
    <p v-if="problem" class="hint bad">{{ problem }}</p>
    <p v-else-if="!drawn" class="hint">Loading the characters...</p>
    <template v-else>
      <p class="hint">{{ drawn.cells.length }} drawn<template v-if="drawn.blank.length">, {{ drawn.blank.length }} left blank</template>.</p>
      <ul class="characters">
        <li v-for="tile of tiles" :key="tile.char">
          <div class="glyph" :style="{ height: `${TILE_HEIGHT}px` }"><img :src="tile.image" :alt="tile.char" :style="tile.style"></div>
          <span class="name">{{ characterName(tile.char) }}</span>
        </li>
        <li v-for="char of drawn.blank" :key="char" class="blank">
          <div class="glyph" :style="{ height: `${TILE_HEIGHT}px` }">Blank</div>
          <span class="name">{{ characterName(char) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
  .characters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 8px 8px;
    background: var(--card);
  }

  .glyph {
    position: relative;
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .glyph img {
    position: absolute;
    image-rendering: pixelated;
  }

  .blank .glyph {
    align-items: center;
    font-size: var(--font-sm);
    color: var(--danger);
  }

  .name {
    font-size: var(--font-sm);
    text-align: center;
    color: var(--muted);
  }
</style>
