<script setup>
  import { onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { hasPicture, missingJars, pictureOf } from "../lib/pictures.js"

  const props = defineProps({
    code: { type: String, required: true },
    large: { type: Boolean, default: false }
  })

  const emit = defineEmits(["open"])

  const element = ref(null)
  const image = ref(null)
  const failed = ref(false)
  const loading = ref(false)
  const jars = ref([])
  let observer = null

  async function show() {
    loading.value = true
    failed.value = false
    const code = props.code
    try {
      const picture = await pictureOf(code, { soon: props.large })
      if (code === props.code) image.value = picture
    } catch (err) {
      console.error(err)
      if (code === props.code) failed.value = true
    } finally {
      loading.value = false
    }
  }

  async function seen() {
    observer?.disconnect()
    observer = null
    try {
      jars.value = await hasPicture(props.code) ? [] : missingJars(props.code)
    } catch (err) {
      console.error(err)
      failed.value = true
      return
    }
    if (!jars.value.length) show()
  }

  function download() {
    jars.value = []
    show()
  }

  function watchForSight() {
    observer?.disconnect()
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) seen()
    }, { rootMargin: "200px" })
    observer.observe(element.value)
  }

  onMounted(watchForSight)
  onBeforeUnmount(() => observer?.disconnect())

  watch(() => props.code, () => {
    image.value = null
    jars.value = []
    failed.value = false
    watchForSight()
  })
</script>

<template>
  <div v-if="large" ref="element" class="picture large">
    <img v-if="image" :src="image" alt="">
    <button v-else-if="jars.length" class="small" @click="download">Load Minecraft {{ jars.join(", ") }}</button>
    <span v-else-if="failed" class="status">Can't show this title</span>
    <span v-else class="status">Loading</span>
  </div>
  <div v-else ref="element" class="picture clickable" role="button" tabindex="0" @click.stop="emit('open')" @keydown.enter="emit('open')">
    <img v-if="image" :src="image" alt="">
    <button v-else-if="jars.length" class="small" @click.stop="download" @keydown.enter.stop>Load Minecraft {{ jars.join(", ") }}</button>
    <span v-else-if="failed" class="status">Can't show this title</span>
    <span v-else-if="loading" class="status">Loading</span>
  </div>
</template>

<style scoped>
  .picture {
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

  .picture img {
    display: block;
    width: 94%;
    height: 94%;
    object-fit: contain;
  }

  .status {
    font-size: var(--font-sm);
    color: var(--faint);
  }
</style>
