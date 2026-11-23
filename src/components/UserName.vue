<script setup>
  import { providerLabel } from "../lib/core/providers.js"
  import Icon from "./Icon.vue"

  defineProps({
    name: { type: String, default: "" },
    provider: { type: String, default: "" },
    size: { type: Number, default: 14 },
    community: { type: Boolean, default: false }
  })
</script>

<template>
  <span v-if="community" class="user-name"><Icon name="community" :size="size" /><span class="ellipsis">Community</span></span>
  <span v-else class="user-name"><Icon :name="provider" :class="provider" :size="size" v-tooltip="providerLabel(provider)" /><span class="ellipsis">{{ name }}</span></span>
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

  .user-name > :deep(svg) {
    flex: none;
    translate: 0 0.1em;
  }

  .user-name > :deep(svg.github) {
    translate: none;
  }
</style>
