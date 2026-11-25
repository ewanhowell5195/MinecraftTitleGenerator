import { ref, watch } from "vue"
import { canvasBlob } from "#lib/core/files.js"
import { canvasLimit } from "#lib/texture/canvas.js"
import { host } from "#lib/panels/host.js"
import { useRenderTask } from "#lib/panels/renderTask.js"
import { framing, setAspect, setResolution } from "#render/framing.js"
import { onlyTitlesShown } from "../render/capture.js"

export const FrameSizeBlock = {
  data: () => ({ framing, max: canvasLimit() }),
  methods: {
    resize(key, event) {
      setResolution(key, event.target.value)
      event.target.value = framing[key]
    },
    reshape(key, event) {
      setAspect(key, event.target.value)
      event.target.value = framing[key]
    }
  },
  template: `
    <div class="mtg-controls">
      <div class="mtg-field">
        <label>Size</label>
        <div class="mtg-row">
          <input type="number" class="dark_bordered mtg-fill" min="1" :max="max" :value="framing.width" @change="resize('width', $event)">
          <span class="mtg-hint">×</span>
          <input type="number" class="dark_bordered mtg-fill" min="1" :max="max" :value="framing.height" @change="resize('height', $event)">
          <div class="tool" :class="{ enabled: framing.linked }" title="Link width and height" @click="framing.linked = !framing.linked"><i class="material-icons">link</i></div>
        </div>
      </div>
      <div class="mtg-field">
        <label>Aspect ratio</label>
        <div class="mtg-row">
          <input type="number" class="dark_bordered mtg-fill" min="1" :max="max" :value="framing.aspectWidth" @change="reshape('aspectWidth', $event)">
          <span class="mtg-hint">:</span>
          <input type="number" class="dark_bordered mtg-fill" min="1" :max="max" :value="framing.aspectHeight" @change="reshape('aspectHeight', $event)">
        </div>
      </div>
    </div>
  `
}

function sizeText(bytes) {
  return bytes > 1048576 ? `${Math.round(bytes / 1048576 * 100) / 100} MB` : `${Math.round(bytes / 1024)} KB`
}

let shown = null

async function showResult(image) {
  shown?.delete()
  const blob = await canvasBlob(image)
  const name = `${host.titleFileName()}.png`
  shown = new Dialog("minecraft_title_render", {
    title: "Render",
    width: 900,
    buttons: [],
    component: {
      data: () => ({ dimensions: `${image.width} × ${image.height}`, size: sizeText(blob.size) }),
      mounted() {
        this.$refs.holder.append(image)
      },
      methods: {
        async copy() {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
            Blockbench.showQuickMessage("Copied to clipboard")
          } catch (err) {
            Blockbench.showQuickMessage(`Could not copy: ${err.message}`, 3000)
          }
        },
        save() {
          host.save(name, blob)
        }
      },
      template: `
        <div class="mtg-controls">
          <div ref="holder" class="mtg-result"></div>
          <div class="mtg-row mtg-hint"><span class="mtg-fill">{{ dimensions }}</span><span>{{ size }}</span></div>
          <div class="mtg-row">
            <button class="mtg-button" @click="copy"><i class="material-icons">file_copy</i><span>Copy render</span></button>
            <button class="mtg-button primary" @click="save"><i class="material-icons">save</i><span>Save render</span></button>
          </div>
        </div>
      `
    }
  })
  shown.show()
}

function progressDialog(cancel) {
  const text = ref("")
  const dialog = new Dialog("minecraft_title_rendering", {
    title: "Rendering",
    width: 420,
    buttons: ["dialog.cancel"],
    progress_bar: {},
    cancel_on_click_outside: false,
    component: { data: () => ({ text }), template: `<p>{{ text }}</p>` },
    onCancel: cancel,
    onButton: cancel
  })
  dialog.show()
  return {
    update(progress, layer, layers) {
      text.value = `${layers.length ? layer ? `${layers[layer - 1]} (${layer}/${layers.length}), ` : "Preparing, " : ""}${Math.floor(progress * 100)}%`
      dialog.progress_bar.setProgress(progress)
    },
    close() {
      dialog.hide()
      dialog.delete()
    }
  }
}

export const RenderButtonsBlock = {
  setup() {
    const task = useRenderTask()
    const { cancel, downloadLayers, failed, layer, layerNames, progress, render, result, saveVector, saving } = task
    const titlesOnly = ref(onlyTitlesShown())
    let showing = null
    watch(progress, (value, was) => {
      if (was === null) showing = progressDialog(cancel)
      if (value === null) {
        showing.close()
        showing = null
      }
    })
    watch([progress, layer, layerNames], ([value, at, names]) => showing?.update(value, at, names))
    watch(result, image => image && showResult(image))
    return { cancel, downloadLayers, failed, framing, progress, render, saveVector, saving, titlesOnly }
  },
  beforeDestroy() {
    this.cancel()
  },
  template: `
    <div class="mtg-controls">
      <button class="mtg-button primary big" :disabled="progress !== null" @click="render"><i class="material-icons">photo_camera</i><span>Render image</span></button>
      <template v-if="titlesOnly">
        <button v-if="framing.tab !== 'minecraft'" class="mtg-button" :disabled="progress !== null || saving" @click="saveVector"><i class="material-icons">download</i><span>Save SVG</span></button>
        <button class="mtg-button" title="A zip with each line as its own image" :disabled="progress !== null" @click="downloadLayers"><i class="material-icons">layers</i><span>Render layers</span></button>
      </template>
      <p v-else class="mtg-hint">SVGs and layers can only be made when nothing but title texts and shapes is shown.</p>
      <p v-if="failed" class="mtg-error">{{ failed }}</p>
    </div>
  `
}
