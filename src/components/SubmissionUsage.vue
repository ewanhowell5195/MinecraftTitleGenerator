<script setup>
  import { computed, onMounted } from "vue"
  import { refreshUsage, usage } from "../lib/community.js"

  const left = computed(() => usage.value && Math.max(0, usage.value.limit - usage.value.used))
  const full = computed(() => usage.value && !left.value)
  const reset = computed(() => usage.value && new Date(usage.value.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))

  onMounted(refreshUsage)
</script>

<template>
  <div v-if="usage && !usage.unlimited" class="usage" :class="{ full }" role="status">
    <span class="pips" aria-hidden="true">
      <i v-for="pip of usage.limit" :key="pip" :class="{ left: pip <= left }"></i>
    </span>
    <span v-if="full">No shares left today. You can share more after {{ reset }}.</span>
    <span v-else>{{ left }} of {{ usage.limit }} shares left today</span>
  </div>
</template>

<style scoped>
  .usage {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-sm);
    color: var(--muted);
    user-select: none;
  }

  .usage.full {
    color: var(--danger);
  }

  .pips {
    display: flex;
    flex: none;
    gap: 3px;
  }

  i {
    display: block;
    width: 12px;
    height: 6px;
    background: var(--line-strong);
  }

  i.left {
    background: var(--muted);
  }
</style>
