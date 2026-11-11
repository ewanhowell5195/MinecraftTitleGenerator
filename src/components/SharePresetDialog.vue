<script setup>
  import { confirmReplacing, confirmSharing, replaceWith, sharePreset } from "../lib/presets.js"
  import Button from "./Button.vue"
  import RenderDialog from "./RenderDialog.vue"
  import ShareFields from "./ShareFields.vue"
  import { useShareForm } from "./shareForm.js"

  const props = defineProps({
    preset: { type: Object, required: true }
  })

  const emit = defineEmits(["close", "shared"])

  const { name, error, sending, agreed, target, problem, blocked, replaceLabel, attempt } = useShareForm(() => props.preset.code, () => props.preset.name)

  async function publish() {
    emit("shared", target.value ? (await replaceWith(target.value, props.preset.code, name.value)).online : await sharePreset(props.preset, name.value))
  }

  function send() {
    if (target.value ? confirmReplacing(target.value) : confirmSharing(name.value.trim() || props.preset.name)) attempt(publish)
  }
</script>

<template>
  <RenderDialog title="Share publicly" close-title="Cancel" wide dismissable @close="emit('close')">
    <form class="dialog-body" @submit.prevent="send">
      <ShareFields v-model:name="name" v-model:target="target" v-model:agreed="agreed" :code="preset.code" label="Share as" :notice="error || problem">
        <Button primary type="submit" :disabled="blocked">{{ target ? replaceLabel : sending ? "Sharing" : "Share" }}</Button>
      </ShareFields>
    </form>
  </RenderDialog>
</template>
