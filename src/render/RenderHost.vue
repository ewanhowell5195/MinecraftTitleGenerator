<script setup>
  import { nextTick, onMounted, ref, watch } from "vue"
  import ObjectRenderer from "../components/ObjectRenderer.js"
  import Viewport from "../components/Viewport.vue"
  import { loadTileables } from "../lib/assets.js"
  import { openTitleData } from "../lib/file.js"
  import { loadFontList } from "../lib/font.js"
  import { titleItems } from "../lib/items.js"
  import { decodeTitle } from "../lib/linkformat.js"
  import { keepMatched } from "../lib/match.js"
  import { library, runtime, scene } from "../lib/scene.js"
  import { DEFAULT_FOV, view, viewport } from "../lib/view.js"

  const RENDER_LIMIT = 180000

  const ready = ref(false)

  Object.assign(view, { section: "text", render: false, gizmo: null, fov: DEFAULT_FOV, fixedDistance: false })

  keepMatched()

  function scales() {
    return scene.objects.map(object => [object.scaleX, object.scaleY]).join()
  }

  function settled() {
    return new Promise((fulfil, reject) => {
      const limit = setTimeout(() => finish(reject, new Error("the title took too long to load")), RENDER_LIMIT)
      const stop = watch([titleItems, () => scene.objects.map(object => runtime[object.id]?.error)], check, { immediate: false })
      function finish(settle, value) {
        clearTimeout(limit)
        stop()
        settle(value)
      }
      function check() {
        const failed = scene.objects.map(object => runtime[object.id]?.error).find(Boolean)
        if (failed) finish(reject, new Error(failed))
        else if (titleItems.value.every(item => item.settled)) finish(fulfil)
      }
      nextTick(check)
    })
  }

  function painted() {
    return new Promise(fulfil => requestAnimationFrame(() => requestAnimationFrame(fulfil)))
  }

  async function render(code) {
    openTitleData(decodeTitle(code))
    await nextTick()
    let before
    do {
      before = scales()
      await settled()
      await painted()
    } while (scales() !== before)
    return viewport.snapshot()
  }

  async function message(event) {
    if (event.origin !== location.origin || event.data?.type !== "render") return
    const { id, code } = event.data
    try {
      parent.postMessage({ type: "rendered", id, image: await render(code) }, location.origin)
    } catch (err) {
      parent.postMessage({ type: "failed", id, error: err.message }, location.origin)
    }
  }

  onMounted(async () => {
    const [fonts, tileables] = await Promise.all([loadFontList(), loadTileables()])
    library.fonts = fonts
    library.tileables = tileables
    ready.value = true
    await nextTick()
    addEventListener("message", message)
    parent.postMessage({ type: "ready" }, location.origin)
  })
</script>

<template>
  <div class="host">
    <Viewport :items="titleItems" :selected="[]" />
    <template v-if="ready">
      <ObjectRenderer v-for="object of scene.objects" :key="object.id" :object="object" :fonts="library.fonts" :tileables="library.tileables" />
    </template>
  </div>
</template>

<style scoped>
  .host {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
  }
</style>
