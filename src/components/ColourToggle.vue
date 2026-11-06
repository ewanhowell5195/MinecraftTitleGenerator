<script setup>
  import ColourPicker from "./ColourPicker.vue"
  import Toggle from "./Toggle.vue"

  defineEmits(["change"])

  const enabled = defineModel("enabled", { type: Boolean, required: true })
  const colour = defineModel("colour", { type: String, required: true })
</script>

<template>
  <div class="colour-toggle">
    <Toggle label="Custom colour" v-model="enabled" @change="$emit('change')" />
    <slot v-if="enabled"><ColourPicker v-model="colour" /></slot>
  </div>
</template>

<style scoped>
  .colour-toggle {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
