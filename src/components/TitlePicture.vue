<script setup>
  import { onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { pictureUrl } from "../lib/pictures.js"

  const props = defineProps({
    code: { type: String, required: true },
    fingerprint: { type: String, default: null },
    large: { type: Boolean, default: false }
  })

  const emit = defineEmits(["open"])

  const element = ref(null)
  const seen = ref(false)
  const loaded = ref(false)
  const failed = ref(false)
  let observer = null

  function watchForSight() {
    observer?.disconnect()
    observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      seen.value = true
    }, { rootMargin: "200px" })
    observer.observe(element.value)
  }

  onMounted(watchForSight)
  onBeforeUnmount(() => observer?.disconnect())

  watch(() => props.code, () => {
    seen.value = false
    loaded.value = false
    failed.value = false
    watchForSight()
  })
</script>

<template>
  <div v-if="large" ref="element" class="picture large">
    <img v-if="seen && !failed" v-show="loaded" :src="pictureUrl({ code, fingerprint })" alt="" @load="loaded = true" @error="failed = true">
    <span v-if="failed" class="status">Can't show this title</span>
    <span v-else-if="!loaded" class="status">Loading</span>
  </div>
  <div v-else ref="element" class="picture clickable" role="button" tabindex="0" @click.stop="emit('open')" @keydown.enter="emit('open')">
    <img v-if="seen && !failed" v-show="loaded" :src="pictureUrl({ code, fingerprint })" alt="" @load="loaded = true" @error="failed = true">
    <span v-if="failed" class="status">Can't show this title</span>
    <span v-else-if="seen && !loaded" class="status">Loading</span>
  </div>
</template>

<style scoped>
  .picture {
    box-sizing: border-box;
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
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
    display: block;
    max-width: 100%;
    max-height: 100%;
  }

  .status {
    font-size: var(--font-sm);
    color: var(--faint);
  }
</style>
