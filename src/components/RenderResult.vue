<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import { downloadBlob } from "../lib/ui.js"
  import Button from "./Button.vue"
  import Icon from "./Icon.vue"
  import RenderDialog from "./RenderDialog.vue"

  const props = defineProps({
    image: { type: Object, required: true },
    name: { type: String, required: true }
  })

  const emit = defineEmits(["close"])

  const holder = ref(null)
  const size = ref("")
  const notice = ref("")
  let noticing = null

  function sizeText(bytes) {
    return bytes > 1048576 ? `${Math.round(bytes / 1048576 * 100) / 100} MB` : `${Math.round(bytes / 1024)} KB`
  }

  const blob = new Promise((resolve, reject) => props.image.toBlob(encoded => encoded ? resolve(encoded) : reject(new Error("could not encode the render")), "image/png"))

  function flash(text) {
    notice.value = text
    clearTimeout(noticing)
    noticing = setTimeout(() => notice.value = "", 1600)
  }

  async function copy() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      flash("Copied to clipboard")
    } catch (err) {
      flash(`Could not copy: ${err.message}`)
    }
  }

  async function save() {
    downloadBlob(props.name, await blob)
  }

  onMounted(async () => {
    holder.value.replaceChildren(props.image)
    size.value = sizeText((await blob).size)
  })

  onBeforeUnmount(() => clearTimeout(noticing))
</script>

<template>
  <RenderDialog title="Render" close-title="Close" large dismissable @close="emit('close')">
    <div class="output">
      <div class="preview">
        <div ref="holder" class="holder"></div>
      </div>
      <div class="details">
        <span>{{ image.width }} × {{ image.height }}</span>
        <span class="notice">{{ notice }}</span>
        <span>{{ size }}</span>
      </div>
      <div class="buttons">
        <Button @click="copy"><template #icon><Icon name="copy" :size="16" /></template>
          <span>Copy render</span>
        </Button>
        <Button primary @click="save"><template #icon><Icon name="download" :size="16" /></template>
          <span>Save render</span>
        </Button>
      </div>
    </div>
  </RenderDialog>
</template>

<style scoped>
  .output {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: 20px;
  }

  .preview {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--field);
  }

  .holder {
    position: absolute;
    inset: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .holder :deep(canvas) {
    display: block;
    max-width: 100%;
    max-height: 100%;
    background: var(--checker);
    outline: 1px solid var(--line-strong);
  }

  .details {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    min-height: 20px;
    font-size: var(--font-md);
    color: var(--faint);
  }

  .notice {
    color: var(--accent);
    text-align: center;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .buttons button {
    flex: 1;
    min-width: 160px;
  }
</style>
