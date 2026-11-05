<script setup>
  import { ref } from "vue"
  import { refreshUsage, sharePublicly, usage } from "../lib/community.js"
  import { NAME_LIMIT, markShared } from "../lib/presets.js"
  import RenderDialog from "./RenderDialog.vue"
  import SubmissionUsage from "./SubmissionUsage.vue"

  const props = defineProps({
    preset: { type: Object, required: true }
  })

  const emit = defineEmits(["close", "shared"])

  const name = ref(props.preset.name)
  const error = ref("")
  const sending = ref(false)

  async function send() {
    if (!confirm(`Share ${name.value.trim() || props.preset.name} publicly?\n\nAnyone will be able to see and use this title. There are no accounts, so you can't edit or remove it after sharing.`)) return
    sending.value = true
    error.value = ""
    try {
      const { preset } = await sharePublicly(props.preset.code, name.value)
      markShared(props.preset, preset.id)
      emit("shared")
    } catch (err) {
      if (err.status === 409) markShared(props.preset, err.id)
      if (err.status === 429) refreshUsage(true)
      error.value = err.message
    } finally {
      sending.value = false
    }
  }
</script>

<template>
  <RenderDialog title="Share publicly" close-title="Cancel" dismissable @close="emit('close')">
    <form class="body" @submit.prevent="send">
      <label>
        <span>Name</span>
        <input type="text" v-model="name" :maxlength="NAME_LIMIT" spellcheck="false">
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="footer">
        <SubmissionUsage />
        <button class="primary" type="submit" :disabled="sending || usage && usage.used >= usage.limit">{{ sending ? "Sharing" : "Share" }}</button>
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
