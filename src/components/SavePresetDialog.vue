<script setup>
  import { confirmReplacing, confirmSharing, namingCode, namingShared, namingSharedId, saveOver, savePreset, sharePreset } from "../lib/presets.js"
  import { openPresetsPage, showPreset } from "../lib/presetsPage.js"
  import Button from "./Button.vue"
  import RenderDialog from "./RenderDialog.vue"
  import ShareFields from "./ShareFields.vue"
  import { useShareForm } from "./shareForm.js"

  const props = defineProps({
    suggested: { type: String, required: true },
    shareOnly: { type: Boolean, default: false }
  })

  const emit = defineEmits(["close"])

  const { name, error, sending, agreed, target, problem, blocked, replaceLabel, attempt } = useShareForm(() => namingCode.value, () => props.suggested)

  function view(id) {
    emit("close")
    openPresetsPage()
    showPreset(id, { replace: true })
  }

  async function replace() {
    const { online } = await saveOver(target.value, name.value)
    if (online) view(online.id)
    else emit("close")
  }

  function save() {
    if (!target.value) savePreset(name.value)
    else if (confirmReplacing(target.value)) attempt(replace)
  }

  async function shareSaved(preset) {
    try {
      return await sharePreset(preset, preset.name)
    } catch (err) {
      throw new Error(`Your preset was saved, but it could not be shared. ${err.message}`)
    }
  }

  async function saveThenShare() {
    const preset = target.value ? (await saveOver(target.value, name.value)).preset : savePreset(name.value, { keepOpen: true })
    if (preset) view((await shareSaved(preset)).id)
    else emit("close")
  }

  function saveAndShare() {
    if (confirmSharing(name.value.trim() || props.suggested)) attempt(saveThenShare)
  }

  function submit() {
    if (!props.shareOnly || target.value?.online) save()
    else if (namingShared.value) view(namingSharedId.value)
    else if (!blocked.value) saveAndShare()
  }
</script>

<template>
  <RenderDialog v-if="shareOnly && namingShared" title="Share publicly" close-title="Cancel" dismissable @close="emit('close')">
    <form class="dialog-body" @submit.prevent="submit">
      <p class="hint">This title is already shared as {{ suggested }}.</p>
      <div class="dialog-actions">
        <Button primary type="submit">View in Community</Button>
      </div>
    </form>
  </RenderDialog>
  <RenderDialog v-else :title="shareOnly ? 'Share publicly' : 'Save preset'" close-title="Cancel" :wide="!namingShared" dismissable @close="emit('close')">
    <form class="dialog-body" @submit.prevent="submit">
      <ShareFields v-model:name="name" v-model:target="target" v-model:agreed="agreed" :code="namingCode" :label="shareOnly ? 'Share as' : 'Save as'" :placeholder="target?.name ?? suggested" :shareable="!namingShared" :notice="error || problem" intro>
        <Button v-if="!shareOnly || target?.online" type="submit" :primary="namingShared || target?.online" :disabled="sending || target?.online && blocked">{{ target ? replaceLabel : "Save" }}</Button>
        <Button v-if="!namingShared && !target?.online" primary :disabled="blocked" @click="saveAndShare">{{ sending ? "Sharing" : target ? "Replace and share" : shareOnly ? "Share" : "Save and share" }}</Button>
      </ShareFields>
    </form>
  </RenderDialog>
</template>
