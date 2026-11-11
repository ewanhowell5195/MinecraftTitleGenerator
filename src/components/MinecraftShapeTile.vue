<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import { modelThumbnail } from "../lib/minecraftModels.js"
  import { titleCase } from "../lib/names.js"
  import Tile from "./Tile.vue"

  const props = defineProps({
    kind: { type: String, required: true },
    id: { type: String, required: true },
    version: { type: String, required: true },
    selected: { type: Boolean, default: false }
  })

  const emit = defineEmits(["pick"])

  const tile = ref(null)
  const picture = ref(null)
  let observer = null

  onMounted(() => {
    observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      modelThumbnail(props.kind, props.id, props.version).then(url => (picture.value = url), () => {})
    })
    observer.observe(tile.value.$el)
  })

  onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Tile ref="tile" :label="titleCase(id)" :image="picture" aspect="1 / 1" :selected="selected" @pick="emit('pick')" />
</template>
