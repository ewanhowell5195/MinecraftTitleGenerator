<script setup>
  import { computed, onMounted } from "vue"
  import { refreshUsage, usage } from "../lib/community.js"

  const full = computed(() => usage.value && usage.value.used >= usage.value.limit)
  const reset = computed(() => usage.value && new Date(usage.value.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))

  onMounted(refreshUsage)
</script>

<template>
  <div v-if="usage" class="usage" :class="{ full }" role="status">
    <span class="pips" aria-hidden="true">
      <i v-for="pip of usage.limit" :key="pip" :class="{ used: pip <= usage.used }"></i>
    </span>
    <span>{{ usage.used }} of {{ usage.limit }} shared today<template v-if="full">. You can share more after {{ reset }}.</template></span>
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

  i.used {
    background: var(--accent);
  }

  .full i.used {
    background: var(--danger);
  }
</style>
