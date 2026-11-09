<script setup>
  defineProps({ fonts: Array, kind: String, target: String, details: Object, file: Object, problems: Object, tried: Boolean })
  defineEmits(["update:target", "update:details", "problem"])
</script>

<template>
  <div></div>
</template>
