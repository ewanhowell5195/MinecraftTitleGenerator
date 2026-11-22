<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"

  const props = defineProps({
    url: { type: String, required: true },
    name: { type: String, default: "" }
  })

  const box = ref(null)
  const natural = ref(null)
  const room = ref(null)
  let observer = null

  const shown = computed(() => {
    if (!natural.value || !room.value) return null
    const fit = Math.min(room.value.width / natural.value.width, room.value.height / natural.value.height)
    const scale = fit >= 1 ? Math.floor(fit) : fit
    return { scale, size: { width: `${natural.value.width * scale}px`, height: `${natural.value.height * scale}px` } }
  })

  function loaded(event) {
    natural.value = { width: event.target.naturalWidth, height: event.target.naturalHeight }
  }

  function measure() {
    room.value = { width: box.value.clientWidth, height: box.value.clientHeight }
  }

  watch(() => props.url, () => natural.value = null)

  onMounted(() => {
    observer = new ResizeObserver(measure)
    observer.observe(box.value)
  })

  onBeforeUnmount(() => observer.disconnect())
</script>

<template>
  <figure class="file-image">
    <a class="image" :href="url" target="_blank" rel="noopener" v-tooltip="'Open full size'">
      <div ref="box" class="room">
        <img :src="url" :alt="name || 'The uploaded PNG'" :style="shown?.size" :class="{ waiting: !shown, smooth: shown?.scale < 1 }" @load="loaded">
      </div>
    </a>
    <figcaption>
      <span class="ellipsis" :title="name">{{ name || "Uploaded PNG" }}</span>
      <span v-if="natural" class="hint">{{ natural.width }}x{{ natural.height }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
  .file-image {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    margin: 0;
  }

  .image {
    position: relative;
    flex: 1;
    min-height: 96px;
    background: var(--checker);
    cursor: zoom-in;
    user-select: none;
  }

  .room {
    position: absolute;
    inset: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  img {
    flex: none;
    image-rendering: pixelated;
  }

  img.smooth {
    image-rendering: auto;
  }

  img.waiting {
    visibility: hidden;
  }

  figcaption {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: var(--font-sm);
  }

  figcaption .hint {
    flex: none;
    margin-left: auto;
  }
</style>
