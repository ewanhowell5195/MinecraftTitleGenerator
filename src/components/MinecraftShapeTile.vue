<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import { dropThumbnail, modelThumbnail } from "../lib/minecraftModels.js"
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
  let wanted = false

  function seen(entries) {
    const visible = entries.at(-1).isIntersecting
    if (visible === wanted) return
    wanted = visible
    if (!visible) return dropThumbnail(props.kind, props.id, props.version)
    modelThumbnail(props.kind, props.id, props.version).then(url => {
      picture.value = url
      observer.disconnect()
    }, () => {})
  }

  onMounted(() => {
    observer = new IntersectionObserver(seen)
    observer.observe(tile.value.$el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    if (wanted) dropThumbnail(props.kind, props.id, props.version)
  })
</script>

<template>
  <Tile ref="tile" :label="titleCase(id)" :image="picture" aspect="1 / 1" :selected="selected" @pick="emit('pick')" />
</template>
