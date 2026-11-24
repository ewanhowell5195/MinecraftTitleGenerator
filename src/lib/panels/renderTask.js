import { ref, shallowRef } from "vue"
import { renderFramed, renderLayers, renderVector } from "../../render/framing.js"
import { painted } from "../core/platform.js"
import { canvasBlob } from "../core/files.js"
import { zipOf } from "../core/zip.js"
import { host } from "./host.js"

export function useRenderTask() {
  const progress = ref(null)
  const layer = ref(0)
  const layerNames = ref([])
  const failed = ref("")
  const result = shallowRef(null)

  let rendering = null
  const saving = ref(false)

  async function rendered(work) {
    host.submitStats()
    rendering = new AbortController()
    progress.value = 0
    layer.value = 0
    layerNames.value = []
    failed.value = ""
    try {
      await painted()
      if (!await work({ signal: rendering.signal, progress: showProgress, layers: names => layerNames.value = names })) failed.value = "Nothing in frame."
    } catch (err) {
      if (rendering.signal.aborted) return
      failed.value = `Render failed: ${err.message}`
      throw err
    } finally {
      progress.value = null
      rendering = null
    }
  }

  function showProgress(value, at) {
    progress.value = value
    layer.value = at
  }

  function render() {
    return rendered(async task => {
      result.value = await renderFramed(task)
      return result.value
    })
  }

  function downloadLayers() {
    return rendered(async task => {
      const layers = await renderLayers(task)
      if (!layers) return false
      const digits = String(layers.length).length
      const files = await Promise.all(layers.map(async ({ name, image }, index) => ({ name: `${String(index + 1).padStart(digits, "0")}_${host.fileName(name, "line")}.png`, blob: await canvasBlob(image) })))
      host.save(`${host.titleFileName()}_layers.zip`, await zipOf(files))
      return true
    })
  }

  function cancel() {
    rendering?.abort()
  }

  async function saveVector() {
    host.submitStats()
    failed.value = ""
    saving.value = true
    try {
      const svg = await renderVector()
      if (!svg) {
        failed.value = "Nothing in frame."
        return
      }
      host.save(`${host.titleFileName()}.svg`, new Blob([svg], { type: "image/svg+xml" }))
    } catch (err) {
      failed.value = `Render failed: ${err.message}`
      throw err
    } finally {
      saving.value = false
    }
  }

  return { cancel, downloadLayers, failed, layer, layerNames, progress, render, result, saveVector, saving }
}
