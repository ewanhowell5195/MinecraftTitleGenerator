<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import { runtime } from "../lib/state/scene.js"
  import { previews } from "./previews.js"

  const props = defineProps({
    id: { type: [Number, String], required: true },
    sight: { type: Function, required: true }
  })

  const thumb = ref(null)
  let unwatch = null

  onMounted(() => (unwatch = props.sight(thumb.value, props.id)))
  onBeforeUnmount(() => unwatch?.())
</script>

<template>
  <div ref="thumb" class="thumb" :class="{ error: runtime[id]?.error }">
    <img v-if="previews[id]" :src="previews[id]" alt="">
  </div>
</template>
