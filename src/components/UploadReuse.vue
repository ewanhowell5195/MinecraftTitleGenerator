<script setup>
  import Tile from "./Tile.vue"
  import TileGrid from "./TileGrid.vue"

  defineProps({
    items: { type: Array, required: true }
  })

  const emit = defineEmits(["pick"])
</script>

<template>
  <template v-if="items.length">
    <h3>Used elsewhere in this title</h3>
    <TileGrid :min="110">
      <Tile v-for="item of items" :key="item.key" :label="item.label" :image="item.image" @pick="emit('pick', item.value)" />
    </TileGrid>
  </template>
</template>
