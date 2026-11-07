<script setup>
  import { ref, watch } from "vue"
  import { usage } from "../lib/community.js"
  import { NAME_LIMIT, confirmReplacing, confirmSharing, replaceWith, sharePreset } from "../lib/presets.js"
  import RenderDialog from "./RenderDialog.vue"
  import ReplaceSelect from "./ReplaceSelect.vue"
  import ShareAccount from "./ShareAccount.vue"
  import SubmissionUsage from "./SubmissionUsage.vue"

  const props = defineProps({
    preset: { type: Object, required: true }
  })

  const emit = defineEmits(["close", "shared"])

  const name = ref(props.preset.name)
  const error = ref("")
  const sending = ref(false)
  const target = ref(null)

  watch(target, next => name.value = next?.name ?? props.preset.name)

  async function send() {
    if (!(target.value ? confirmReplacing(target.value) : confirmSharing(name.value.trim() || props.preset.name))) return
    sending.value = true
    error.value = ""
    try {
      emit("shared", target.value ? (await replaceWith(target.value, props.preset.code, name.value)).online : await sharePreset(props.preset, name.value))
    } catch (err) {
      error.value = err.message
    } finally {
      sending.value = false
    }
  }
</script>

<template>
  <RenderDialog title="Share publicly" close-title="Cancel" wide dismissable @close="emit('close')">
    <form class="body" @submit.prevent="send">
      <ReplaceSelect v-model="target" :code="preset.code" label="Share as" />
      <label>
        <span>Name</span>
        <input type="text" v-model="name" :maxlength="NAME_LIMIT" spellcheck="false">
      </label>
      <ShareAccount v-if="!target" />
      <p v-if="error" class="error">{{ error }}</p>
      <div class="footer">
        <SubmissionUsage v-if="!target" />
        <button class="primary" type="submit" :disabled="sending || !target && usage && usage.used >= usage.limit">{{ target ? sending ? "Replacing" : "Replace" : sending ? "Sharing" : "Share" }}</button>
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

  .error {
    margin: 0;
    font-size: var(--font-md);
    color: var(--danger);
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  button {
    flex: none;
    margin-left: auto;
  }
</style>
