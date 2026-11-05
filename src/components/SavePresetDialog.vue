<script setup>
  import { onMounted, ref } from "vue"
  import { usage } from "../lib/community.js"
  import { NAME_LIMIT, confirmSharing, namingShared, savePreset, sharePreset } from "../lib/presets.js"
  import { openPresetsPage, showPreset } from "../lib/presetsPage.js"
  import RenderDialog from "./RenderDialog.vue"
  import SubmissionUsage from "./SubmissionUsage.vue"

  const props = defineProps({
    suggested: { type: String, required: true }
  })

  const emit = defineEmits(["close"])

  const name = ref(props.suggested)
  const field = ref(null)
  const error = ref("")
  const sending = ref(false)

  async function saveAndShare() {
    if (!confirmSharing(name.value.trim() || props.suggested)) return
    sending.value = true
    error.value = ""
    const preset = savePreset(name.value, { keepOpen: true })
    try {
      if (!preset) {
        emit("close")
        return
      }
      const { id } = await sharePreset(preset, preset.name)
      emit("close")
      openPresetsPage()
      showPreset(id, { replace: true })
    } catch (err) {
      error.value = `Your preset was saved, but it could not be shared. ${err.message}`
    } finally {
      sending.value = false
    }
  }

  onMounted(() => {
    field.value.focus()
    field.value.select()
  })
</script>

<template>
  <RenderDialog title="Save preset" close-title="Cancel" :wide="!namingShared" dismissable @close="emit('close')">
    <form class="body" @submit.prevent="savePreset(name)">
      <label>
        <span>Name</span>
        <input ref="field" type="text" v-model="name" :maxlength="NAME_LIMIT" :placeholder="suggested" spellcheck="false">
      </label>
      <p v-if="!namingShared" class="hint">Share your title so other people can find it in the community presets and use it for themselves.</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="footer">
        <SubmissionUsage v-if="!namingShared" class="usage" />
        <div class="buttons">
          <button type="submit" :class="{ primary: namingShared }">Save</button>
          <button v-if="!namingShared" class="primary" type="button" :disabled="sending || usage && usage.used >= usage.limit" @click="saveAndShare">{{ sending ? "Sharing" : "Save and share" }}</button>
        </div>
      </div>
    </form>
  </RenderDialog>
</template>

<style scoped>
  .body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--font-md);
    font-weight: 600;
    user-select: none;
  }

  input {
    font-weight: 400;
  }

  .hint {
    margin: 0;
  }

  .error {
    margin: 0;
    font-size: var(--font-md);
    color: var(--danger);
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .buttons {
    display: flex;
    flex: none;
    gap: 8px;
    margin-left: auto;
  }

  .buttons button {
    user-select: none;
  }

  .usage {
    flex: 1 1 200px;
  }
</style>
