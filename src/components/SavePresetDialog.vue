<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import { usage } from "../lib/community.js"
  import { NAME_LIMIT, confirmReplacing, confirmSharing, namingCode, namingShared, namingSharedId, saveOver, savePreset, sharePreset } from "../lib/presets.js"
  import { openPresetsPage, showPreset } from "../lib/presetsPage.js"
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
    suggested: { type: String, required: true },
    shareOnly: { type: Boolean, default: false }
  })

  const emit = defineEmits(["close"])

  const name = ref(props.suggested)
  const field = ref(null)
  const error = ref("")
  const sending = ref(false)
  const agreed = ref(false)
  const target = ref(null)
  const problem = computed(() => namingCode.value ? sharingProblem(namingCode.value, name.value.trim() || props.suggested) : null)

  watch(target, next => name.value = next?.name ?? props.suggested)

  async function save() {
    if (!target.value) {
      savePreset(name.value)
      return
    }
    if (!confirmReplacing(target.value)) return
    sending.value = true
    error.value = ""
    try {
      const { online } = await saveOver(target.value, name.value)
      emit("close")
      if (online) {
        openPresetsPage()
        showPreset(online.id, { replace: true })
      }
    } catch (err) {
      error.value = err.message
    } finally {
      sending.value = false
    }
  }

  async function saveAndShare() {
    if (!confirmSharing(name.value.trim() || props.suggested)) return
    sending.value = true
    error.value = ""
    try {
      const preset = target.value ? (await saveOver(target.value, name.value)).preset : savePreset(name.value, { keepOpen: true })
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

  function viewShared() {
    emit("close")
    openPresetsPage()
    showPreset(namingSharedId.value, { replace: true })
  }

  function submit() {
    if (!props.shareOnly) save()
    else if (namingShared.value) viewShared()
    else saveAndShare()
  }

  onMounted(() => {
    field.value?.focus()
    field.value?.select()
  })
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
  <RenderDialog v-else :title="shareOnly ? 'Share publicly' : 'Save preset'" close-title="Cancel" :wide="!namingShared && !shareOnly" dismissable @close="emit('close')">
    <form class="dialog-body" @submit.prevent="submit">
      <ReplaceSelect v-if="!namingShared && !shareOnly" v-model="target" :code="namingCode" label="Save as" />
      <Field label="Name">
        <input ref="field" type="text" v-model="name" :maxlength="NAME_LIMIT" :placeholder="target?.name ?? suggested" spellcheck="false">
      </Field>
      <template v-if="!namingShared && !target?.online">
        <p class="hint">Share your title so other people can find it in the community presets and use it for themselves.</p>
        <ShareAccount />
      </template>
      <Checkbox v-if="!namingShared || target?.online" v-model="agreed">I agree to the <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a></Checkbox>
      <Notice v-if="error || problem">{{ error || problem }}</Notice>
      <div class="dialog-actions">
        <SubmissionUsage v-if="!namingShared && !target?.online" class="usage" />
        <div class="buttons">
          <Button v-if="!shareOnly" type="submit" :primary="namingShared || target?.online" :disabled="sending || target?.online && (!!problem || !agreed)">{{ target ? "Replace" : "Save" }}</Button>
          <Button v-if="!namingShared && !target?.online" primary :disabled="sending || !!problem || !agreed || usage && usage.used >= usage.limit" @click="saveAndShare">{{ sending ? "Sharing" : shareOnly ? "Share" : target ? "Replace and share" : "Save and share" }}</Button>
        </div>
      </div>
    </form>
  </RenderDialog>
</template>

<style scoped>
  .buttons {
    display: flex;
    flex: none;
    gap: 8px;
    margin-left: auto;
  }

  .usage {
    flex: 1 1 200px;
  }
</style>
