<script setup>
  import { usePanel } from "../../lib/panel.js"
  import { library } from "../../lib/scene.js"
  import Panel from "../Panel.vue"
  import Tile from "../Tile.vue"
  import TileGrid from "../TileGrid.vue"

  const { object } = usePanel("shape")
</script>

<template>
  <Panel title="Shape">
    <TileGrid>
      <Tile v-for="shape of library.shapes" :key="shape.id" :label="shape.name" :image="`${shape.folder}/thumbnails/flat.png`" aspect="4 / 3" :author="shape.author" :selected="object.shape === shape.id" @pick="object.shape = shape.id" />
    </TileGrid>
  </Panel>
</template>
