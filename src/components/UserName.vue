<script setup>
  import { providerLabel } from "../lib/providers.js"
  import Icon from "./Icon.vue"

  defineProps({
    name: { type: String, required: true },
    provider: { type: String, required: true },
    size: { type: Number, default: 14 }
  })
</script>

<template>
  <span class="user-name"><Icon :name="provider" :size="size" v-tooltip="providerLabel(provider)" /><span class="ellipsis">{{ name }}</span></span>
</template>

<style scoped>
  .user-name {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    vertical-align: bottom;
  }

  .ellipsis {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .user-name > :deep(svg) {
    flex: none;
    translate: 0 0.1em;
  }
</style>
