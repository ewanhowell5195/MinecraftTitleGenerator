<script setup>
  import { providerLabel } from "../../lib/core/providers.js"
  import UserName from "../../components/UserName.vue"

  defineProps({
    name: { type: String, required: true },
    provider: { type: String, required: true },
    size: { type: Number, default: 14 },
    searched: { type: Boolean, default: false }
  })
</script>

<template>
  <button type="button" class="link-button" v-tooltip="searched ? null : { text: `Show presets by ${name} on ${providerLabel(provider)}`, tooltipClass: 'slow' }"><UserName :name="name" :provider="provider" :size="size" /></button>
</template>
