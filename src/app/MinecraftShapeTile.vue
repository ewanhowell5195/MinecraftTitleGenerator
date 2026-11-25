<script setup>
  import { useModelPicture } from "../lib/panels/modelPicture.js"
  import { titleCase } from "../lib/core/names.js"
  import Tile from "../components/Tile.vue"

  const props = defineProps({
    kind: { type: String, required: true },
    id: { type: String, required: true },
    version: { type: String, required: true },
    selected: { type: Boolean, default: false }
  })

  const emit = defineEmits(["pick"])

  const { picture, tile } = useModelPicture(props)
</script>

<template>
  <Tile ref="tile" :label="titleCase(id)" :image="picture" aspect="1 / 1" :selected="selected" @pick="emit('pick')" />
</template>
