<script setup>
  import { computed, ref, watch } from "vue"
  import { usage } from "../lib/community.js"
  import { NAME_LIMIT, confirmReplacing, confirmSharing, replaceWith, sharePreset } from "../lib/presets.js"
  import { sharingProblem } from "../lib/titleFacts.js"
  import Button from "./Button.vue"
  import Checkbox from "./Checkbox.vue"
  import Field from "./Field.vue"
  import Notice from "./Notice.vue"
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
  const agreed = ref(false)
  const target = ref(null)
  const problem = computed(() => sharingProblem(props.preset.code, name.value.trim() || props.preset.name))

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
    <form class="dialog-body" @submit.prevent="send">
      <ReplaceSelect v-model="target" :code="preset.code" label="Share as" />
      <Field label="Name">
        <input type="text" v-model="name" :maxlength="NAME_LIMIT" spellcheck="false">
      </Field>
      <ShareAccount v-if="!target" />
      <Checkbox v-model="agreed">I agree to the <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a></Checkbox>
      <Notice v-if="error || problem">{{ error || problem }}</Notice>
      <div class="dialog-actions">
        <SubmissionUsage v-if="!target" class="grow" />
        <Button primary type="submit" :disabled="sending || !!problem || !agreed || !target && usage && usage.used >= usage.limit">{{ target ? sending ? "Replacing" : "Replace" : sending ? "Sharing" : "Share" }}</Button>
      </div>
    </form>
  </RenderDialog>
</template>

<style scoped>
  button {
    flex: none;
    margin-left: auto;
  }
</style>
