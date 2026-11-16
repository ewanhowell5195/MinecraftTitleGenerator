<script setup>
  import Icon from "../components/Icon.vue"

  defineProps({
    title: { type: String, required: true }
  })

  defineEmits(["reset"])
</script>

<template>
  <button type="button" class="reset-icon" v-tooltip="title" :aria-label="title" @click.prevent="$emit('reset')"><Icon name="reset" :size="12" /></button>
</template>

<style scoped>
  .reset-icon {
    float: right;
    display: inline-flex;
    align-items: center;
    height: 1lh;
    margin-left: 6px;
    padding: 0;
    color: var(--faint);
    background: transparent;
    border: 0;
    user-select: none;
  }

  .reset-icon:hover {
    color: var(--text);
  }
</style>
