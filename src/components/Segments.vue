<script setup>
  defineProps({
    options: { type: Array, required: true },
    modelValue: { required: true }
  })

  const emit = defineEmits(["update:modelValue"])
</script>

<template>
  <ul class="segments">
    <li v-for="{ value, label, title } of options" :key="value" tabindex="0" :class="{ selected: modelValue === value }" :title="title" @click="emit('update:modelValue', value)" @keydown.enter="emit('update:modelValue', value)">{{ label }}</li>
  </ul>
</template>
