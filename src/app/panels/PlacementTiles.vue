<script setup>
  import { TYPES } from "#lib/settings/defaults.js"
  import { host } from "#lib/panels/host.js"
  import Tile from "#c/Tile.vue"
  import TileGrid from "#c/TileGrid.vue"

  const LAYERS = {
    top: ["top"],
    bottom: ["bottom", "top"],
    small: ["top", "small"]
  }

  defineProps({
    panel: { type: Object, required: true },
    context: { type: Object, required: true }
  })
</script>

<template>
  <TileGrid :columns="1">
    <Tile v-for="(data, id) of TYPES" :key="id" :label="data.name" aspect="auto" :selected="context.get('type') === id" @pick="host.placeLine(id)">
      <template #picture>
        <span class="preview">
          <img v-for="layer of LAYERS[id]" :key="layer" :src="`placement/${id}-${layer}.png`" :class="{ dim: layer !== id }" alt="">
        </span>
      </template>
    </Tile>
  </TileGrid>
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
