<script setup>
  import { computed, onMounted, ref } from "vue"
  import { NAME_LIMIT } from "../lib/presets.js"
  import Checkbox from "./Checkbox.vue"
  import Field from "./Field.vue"
  import Notice from "./Notice.vue"
  import ReplaceSelect from "./ReplaceSelect.vue"
  import ShareAccount from "./ShareAccount.vue"
  import SubmissionUsage from "./SubmissionUsage.vue"

  const props = defineProps({
    code: { type: String, required: true },
    label: { type: String, required: true },
    placeholder: { type: String, default: null },
    shareable: { type: Boolean, default: true },
    intro: { type: Boolean, default: false },
    notice: { type: String, default: "" }
  })

  const name = defineModel("name", { type: String, required: true })
  const target = defineModel("target", { type: Object, default: null })
  const agreed = defineModel("agreed", { type: Boolean, required: true })

  const field = ref(null)
  const fresh = computed(() => props.shareable && !target.value?.online)

  onMounted(() => {
    field.value.focus()
    field.value.select()
  })
</script>

<template>
  <ReplaceSelect v-if="shareable" v-model="target" :code="code" :label="label" />
  <Field label="Name">
    <input ref="field" type="text" v-model="name" :maxlength="NAME_LIMIT" :placeholder="placeholder" spellcheck="false">
  </Field>
  <template v-if="fresh">
    <p v-if="intro" class="hint">Share your title so other people can find it in the community presets and use it for themselves.</p>
    <ShareAccount />
  </template>
  <Checkbox v-if="shareable" v-model="agreed">I agree to the <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a></Checkbox>
  <Notice v-if="notice">{{ notice }}</Notice>
  <div class="dialog-actions">
    <SubmissionUsage v-if="fresh" class="usage" />
    <div class="buttons">
      <slot></slot>
    </div>
  </div>
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
