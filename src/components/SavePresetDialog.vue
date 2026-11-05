<script setup>
  import { onMounted, ref } from "vue"
  import { NAME_LIMIT, savePreset } from "../lib/presets.js"
  import RenderDialog from "./RenderDialog.vue"

  const props = defineProps({
    suggested: { type: String, required: true }
  })

  const emit = defineEmits(["close"])

  const name = ref(props.suggested)
  const field = ref(null)

  onMounted(() => {
    field.value.focus()
    field.value.select()
  })
</script>

<template>
  <RenderDialog title="Save preset" close-title="Cancel" dismissable @close="emit('close')">
    <form class="body" @submit.prevent="savePreset(name)">
      <label>
        <span>Name</span>
        <input ref="field" type="text" v-model="name" :maxlength="NAME_LIMIT" :placeholder="suggested" spellcheck="false">
      </label>
      <div class="footer">
        <button class="primary" type="submit">Save</button>
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

  .footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
