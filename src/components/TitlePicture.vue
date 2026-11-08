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

  function open(event) {
    if (props.large) return
    event.stopPropagation()
    emit("open")
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
  <div ref="element" class="picture" :class="large ? 'large' : 'clickable'" :role="large ? null : 'button'" :tabindex="large ? null : 0" @click="open" @keydown.enter="open">
    <img v-if="seen && !failed" v-show="loaded" :src="pictureUrl({ code, fingerprint })" alt="" @load="loaded = true" @error="failed = true">
    <span v-if="failed" class="status">Can't show this title</span>
    <span v-else-if="(large || seen) && !loaded" class="status">Loading</span>
  </div>
</template>

<style scoped>
  .picture {
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
    display: block;
  }

  .status {
    font-size: var(--font-sm);
    color: var(--faint);
  }
</style>
