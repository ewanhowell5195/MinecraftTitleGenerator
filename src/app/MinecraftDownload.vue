<script setup>
  import { computed } from "vue"
  import { jar } from "../lib/minecraft/minecraft.js"
  import ProgressBar from "./ProgressBar.vue"

  const progress = computed(() => jar.total ? jar.done / jar.total : 0)
</script>

<template>
  <div v-if="jar.version" class="download">
    <span>Downloading Minecraft {{ jar.version }}</span>
    <ProgressBar :value="progress" />
  </div>
</template>

<style scoped>
  .download {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    font-size: var(--font-sm);
    color: var(--muted);
  }
</style>
