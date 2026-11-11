<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from "vue"
  import * as THREE from "three"
  import ModelRenderer from "./ModelRenderer.js"
  import ObjectRenderer from "./ObjectRenderer.js"
  import { readTitleObjects } from "../lib/file.js"
  import { createTitleItems } from "../lib/items.js"
  import { keepMatched } from "../lib/match.js"
  import { platform } from "../lib/platform.js"
  import { keepTexture } from "../lib/scene.js"
  import { FILE_VERSION } from "../lib/settings.js"
  import { loadKey } from "../lib/shapes.js"
  import { createSmoothing } from "../lib/smoothing.js"
  import { createStage, frameCamera, titleFraming } from "../lib/stage.js"
  import { OFFSCREEN_VIEW, createTitle, firstError } from "../lib/title.js"

  const NO_TILEABLES = {}

  const props = defineProps({
    lines: { type: Array, default: () => [] },
    fonts: { type: Array, required: true },
    message: { type: String, default: "" }
  })

  const emit = defineEmits(["settled"])

  const title = createTitle(reactive([]), OFFSCREEN_VIEW)
  const items = createTitleItems(title)
  const stage = ref(null)
  const readError = ref("")
  const world = createStage()
  let renderer, camera, smoothing, observer
  let size = { width: 1, height: 1 }
  let frame = 0
  let fitted = null
  let waiting = false

  const error = computed(() => readError.value || firstError(title) || "")
  const busy = computed(() => !items.value.every(item => item.settled))
  const shown = computed(() => items.value.some(item => item.built?.body.triangles))

  keepMatched(title)

  function same(a, b) {
    return a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b))
  }

  function check() {
    if (!waiting || busy.value) return
    waiting = false
    emit("settled")
  }

  function load(lines) {
    waiting = true
    nextTick(check)
    const objects = title.objects
    if (!lines.length) {
      readError.value = ""
      objects.splice(0)
      return
    }
    let fresh
    try {
      fresh = readTitleObjects({ version: FILE_VERSION, lines })
    } catch (err) {
      readError.value = err.message
      objects.splice(0)
      return
    }
    readError.value = ""
    let at = 0
    for (const line of lines) {
      if (line.customModel && !line.words) fresh[at].customModel = line.customModel
      at += line.words?.length ?? 1
    }
    if (fresh.length !== objects.length || fresh.some((object, index) => object.group !== objects[index].group)) {
      objects.splice(0, objects.length, ...fresh)
      return
    }
    const ids = new Map(fresh.map((object, index) => [object.id, objects[index].id]))
    for (const [index, object] of fresh.entries()) {
      const target = objects[index]
      if (loadKey(target) !== loadKey(object)) keepTexture.add(target)
      for (const [key, value] of Object.entries(toRaw(object))) {
        const next = key === "matchWidth" && value !== null ? ids.get(value) : value
        if (key !== "id" && !same(toRaw(target[key]), next)) target[key] = next
      }
    }
  }

  function invalidate() {
    if (!frame && renderer) frame = requestAnimationFrame(draw)
  }

  function draw() {
    frame = 0
    if (fitted !== items.value && !busy.value) {
      const framed = titleFraming(items.value, false)
      if (framed) {
        fitted = items.value
        frameCamera(camera, { ...framed, fov: title.view.fov, ...size })
      }
    }
    if (!fitted) return
    world.sort(camera)
    smoothing.draw(world.scene, camera)
  }

  function sync() {
    world.sync(items.value)
    invalidate()
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = stage.value
    if (!width || !height) return
    size = { width, height }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    smoothing.resize()
    fitted = null
    invalidate()
  }

  load(props.lines)

  onMounted(() => {
    renderer = platform.createWebGLRenderer()
    smoothing = createSmoothing(renderer)
    camera = new THREE.PerspectiveCamera(title.view.fov, 1, 1, 5000)
    stage.value.append(renderer.domElement)
    observer = new ResizeObserver(resize)
    observer.observe(stage.value)
    resize()
    sync()
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    world.dispose()
    smoothing.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    renderer = null
  })

  watch(() => props.lines, load, { flush: "post" })
  watch(items, () => renderer && sync())
  watch(busy, check)
</script>

<template>
  <div class="render">
    <div ref="stage" class="stage" :class="{ hidden: !shown || error }"></div>
    <template v-for="object of title.objects" :key="object.id">
      <ModelRenderer v-if="object.customModel" :object="object" :shapes="[]" :title="title" />
      <ObjectRenderer v-else :object="object" :fonts="fonts" :tileables="NO_TILEABLES" :title="title" />
    </template>
    <p v-if="error" class="message bad">{{ error }}</p>
    <p v-else-if="!shown" class="message empty-state">{{ busy ? "Rendering..." : message }}</p>
  </div>
</template>

<style scoped>
  .render {
    position: relative;
    min-width: 0;
    aspect-ratio: 2;
    overflow: hidden;
    background: var(--checker);
  }

  .stage {
    position: absolute;
    inset: 0;
  }

  .stage.hidden {
    visibility: hidden;
  }

  .stage :deep(canvas) {
    display: block;
  }

  .message {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0 12px;
    text-align: center;
  }

  .bad {
    color: var(--danger);
  }
</style>
