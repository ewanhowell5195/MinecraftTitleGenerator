<script setup>
  import { onMounted, ref, watch } from "vue"
  import { pictureUrl, previewAlt } from "#lib/core/pictures.js"

  const props = defineProps({
    code: { type: String, required: true },
    fingerprint: { type: String, default: null },
    name: { type: String, default: null },
    large: { type: Boolean, default: false }
  })

  const emit = defineEmits(["open"])

  const image = ref(null)
  const loaded = ref(true)
  const failed = ref(false)

  function open(event) {
    if (props.large) return
    event.stopPropagation()
    emit("open")
  }

  onMounted(() => {
    if (!image.value?.complete) loaded.value = false
  })

  watch(() => props.code, () => {
    loaded.value = false
    failed.value = false
  })
</script>

<template>
  <div class="picture" :class="large ? 'large' : 'clickable'" :role="large ? null : 'button'" :tabindex="large ? null : 0" @click="open" @keydown.enter="open" @keydown.space.prevent="open">
    <img v-if="!failed" ref="image" v-popupable="large && loaded && { zoomable: true, noUpscale: true }" :class="{ waiting: !loaded }" :src="pictureUrl({ code, fingerprint })" :alt="name ? previewAlt(name) : ''" loading="lazy" @load="loaded = true" @error="failed = true">
    <span v-if="failed" class="status empty-state">Can't show this title</span>
    <span v-else-if="!loaded" class="status empty-state">Loading</span>
  </div>
</template>

<style scoped>
  .picture {
    position: relative;
    padding: 12px;
    width: 100%;
    aspect-ratio: 2;
    background: var(--checker);
    user-select: none;
  }

  .clickable {
    cursor: pointer;
  }

  .picture:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .large {
    padding: 24px;
  }

  .picture img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: inherit;
  }

  .large img {
    background: var(--checker);
  }

  .picture img.waiting {
    visibility: hidden;
  }
</style>
