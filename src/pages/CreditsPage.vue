<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import html from "virtual:credits"
  import { startCredits } from "../credits/credits.js"

  const root = ref(null)
  const leaving = new AbortController()

  onMounted(() => startCredits(root.value, leaving.signal))
  onBeforeUnmount(() => leaving.abort())
</script>

<template>
  <main ref="root" class="credits" v-html="html"></main>
</template>
