<script setup>
  import { confirmReplacing, confirmSharing } from "#lib/presets/savedPresets.js"
  import { publishPreset } from "#lib/presets/sharing.js"
  import Button from "#c/Button.vue"
  import Dialog from "#c/Dialog.vue"
  import ShareFields from "./ShareFields.vue"
  import { useShareForm } from "#lib/presets/shareForm.js"

  const props = defineProps({
    preset: { type: Object, required: true }
  })

  const emit = defineEmits(["close", "shared"])

  const { name, error, sending, agreed, target, problem, blocked, replaceLabel, attempt } = useShareForm(() => props.preset.code, () => props.preset.name)

  async function publish() {
    emit("shared", await publishPreset(props.preset, target.value, name.value))
  }

  async function send() {
    if (await (target.value ? confirmReplacing(target.value) : confirmSharing(name.value.trim() || props.preset.name))) attempt(publish)
  }
</script>

<template>
  <Dialog title="Share publicly" close-title="Cancel" wide dismissable @close="emit('close')">
    <form class="dialog-body" @submit.prevent="send">
      <ShareFields v-model:name="name" v-model:target="target" v-model:agreed="agreed" :code="preset.code" label="Share as" :notice="error || problem">
        <Button primary type="submit" :disabled="blocked">{{ target ? replaceLabel : sending ? "Sharing" : "Share" }}</Button>
      </ShareFields>
    </form>
  </Dialog>
</template>
