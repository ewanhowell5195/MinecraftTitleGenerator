<script setup>
  import { providerLabel } from "../lib/providers.js"
  import UserName from "./UserName.vue"

  defineProps({
    name: { type: String, required: true },
    provider: { type: String, required: true },
    size: { type: Number, default: 14 }
  })
</script>

<template>
  <button type="button" class="link-button" v-tooltip="{ text: `Show presets by ${name} on ${providerLabel(provider)}`, tooltipClass: 'slow' }"><UserName :name="name" :provider="provider" :size="size" /></button>
</template>
