import { onBeforeUnmount, ref, watch } from "vue"
import { canvasBlob, copyImage, sizeText } from "#lib/core/files.js"
import { host } from "#lib/panels/host.js"
import { VotePrompt } from "../presets/votePrompt.js"

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
      components: { VotePrompt },
      data: () => ({ dimensions: `${image.width} × ${image.height}`, size: sizeText(blob.size) }),
      mounted() {
        this.$refs.holder.append(image)
      },
      methods: {
        async copy() {
          Blockbench.showQuickMessage(await copyImage(blob), 3000)
        },
        save() {
          host.save(name, blob)
        }
      },
      template: `
        <div class="mtg-controls">
          <div ref="holder" class="mtg-result mtg-checker"></div>
          <div class="mtg-row mtg-hint"><span class="mtg-fill">{{ dimensions }}</span><span>{{ size }}</span></div>
          <vote-prompt />
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

export const RenderOutput = {
  props: { panel: Object, context: Object },
  setup({ context }) {
    const { cancel, layer, layerNames, progress, result } = context.state
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
    onBeforeUnmount(cancel)
    return () => null
  }
}
