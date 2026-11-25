<script setup>
  import { computed } from "vue"
  import { readImageFile } from "#lib/panels/imageUpload.js"
  import { fileError } from "#lib/state/notices.js"
  import UploadField from "#c/UploadField.vue"

  const props = defineProps({
    control: { type: Object, required: true },
    state: { type: Object, required: true }
  })

  const { context, resolved } = props.state
  const view = computed(() => resolved(props.control.view))

  async function upload(event) {
    const files = Array.from(event.target.files)
    event.target.value = ""
    if (!files.length) return
    if (props.control.files) return props.control.files(files, context)
    try {
      await readImageFile(files[0], data => props.control.pick(data, context))
    } catch (err) {
      fileError.value = err.message
    }
  }
</script>

<template>
  <UploadField :label="view.label" :empty="view.empty" :image="view.image" :disabled="view.disabled" :clearable="view.clearable" :back="view.back" :accept="control.accept" :multiple="control.multiple" @change="upload" @clear="control.clear?.(context)">
    <template v-if="view.preview" #preview>
      <div class="custom-font">
        <div class="preview picture"><img v-if="view.preview.image" :src="view.preview.image" alt="" :style="view.preview.unit ? { height: `${view.preview.unit}px` } : null"></div>
        <span class="name ellipsis">{{ view.preview.name }}</span>
      </div>
    </template>
  </UploadField>
</template>

<style scoped>
  .custom-font {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 10px 10px;
    background: var(--field);
  }

  .preview {
    width: 100%;
    min-height: 48px;
  }

  .name {
    max-width: 100%;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text);
  }
</style>
