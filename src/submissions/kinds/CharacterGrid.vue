<script setup>
  import { computed, shallowRef, watch } from "vue"
  import { characterName } from "../../lib/fontEditor.js"
  import { drawnCells, submittedFont } from "../../lib/submissionKinds/fontBuild.js"

  const TILE_HEIGHT = 72

  const props = defineProps({
    url: { type: String, required: true }
  })

  const drawn = shallowRef(null)
  const problem = shallowRef("")

  const span = computed(() => {
    if (!drawn.value?.cells.length) return null
    const top = Math.max(...drawn.value.cells.map(cell => cell.top))
    const bottom = Math.min(...drawn.value.cells.map(cell => cell.bottom))
    return { top, bottom, scale: TILE_HEIGHT / (top - bottom) }
  })

  const tiles = computed(() => drawn.value && span.value ? drawn.value.cells.map(cell => ({ char: cell.char, image: glyphImage(cell), style: { width: `${cell.width * span.value.scale}px`, height: `${cell.height * span.value.scale}px`, top: `${(span.value.top - cell.top) * span.value.scale}px` } })) : [])

  function glyphImage(cell) {
    const canvas = document.createElement("canvas")
    canvas.width = cell.width
    canvas.height = cell.height
    const ctx = canvas.getContext("2d")
    const image = ctx.createImageData(cell.width, cell.height)
    cell.mask.forEach((value, index) => {
      if (value) image.data.set([241, 242, 244, 255], ((cell.height - 1 - Math.floor(index / cell.width)) * cell.width + index % cell.width) * 4)
    })
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL()
  }

  watch(() => props.url, async url => {
    drawn.value = null
    problem.value = ""
    try {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
      if (url === props.url) drawn.value = drawnCells(submittedFont(bytes).font)
    } catch (err) {
      problem.value = err.message
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
