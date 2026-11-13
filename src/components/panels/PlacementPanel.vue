<script setup>
  import { usePanel } from "../../lib/panel.js"
  import { TYPES, applyType, defaultTexture, setTexture } from "../../lib/settings.js"
  import { selection, words } from "../../lib/scene.js"
  import Panel from "../Panel.vue"
  import Slider from "../Slider.vue"
  import Tile from "../Tile.vue"
  import TileGrid from "../TileGrid.vue"

  const LAYERS = {
    top: ["top"],
    bottom: ["bottom", "top"],
    small: ["top", "small"]
  }

  const { object, font, list, modified } = usePanel("placement")

  function pick(type) {
    if (object.value.type === type) return
    for (const word of words(selection.value[0])) {
      if (list.value && !word.textureVariant && word.texture === defaultTexture(list.value, word.type)) setTexture(word, { texture: defaultTexture(list.value, type) }, { before: list.value })
      word.type = type
      if (type !== "top") word.row = Math.max(0, word.row)
      applyType(word, type, font.value)
    }
  }

  function reset() {
    pick("top")
    object.value.row = 0
    object.value.rowSpacing = 0
  }
</script>

<template>
  <Panel title="Placement" :modified="modified" @reset="reset">
    <TileGrid :columns="1">
      <Tile v-for="(data, id) of TYPES" :key="id" :label="data.name" aspect="auto" :selected="object.type === id" @pick="pick(id)">
        <template #picture>
          <span class="preview">
            <img v-for="layer of LAYERS[id]" :key="layer" :src="`placement/${id}-${layer}.png`" :class="{ dim: layer !== id }" alt="">
          </span>
        </template>
      </Tile>
    </TileGrid>
    <h3>Rows</h3>
    <p class="hint">Stack more lines of the same placement by giving each its own row.</p>
    <Slider label="Row" v-model="object.row" :min="object.type === 'top' ? -3 : 0" :max="3" />
    <Slider v-if="object.row !== 0" label="Row spacing" v-model="object.rowSpacing" :min="-4" :max="20" />
  </Panel>
</template>

<style scoped>
  .preview {
    display: grid;
    width: 100%;
  }

  .preview img {
    grid-area: 1 / 1;
    width: 100%;
  }

  .preview img.dim {
    opacity: 0.2;
  }
</style>
