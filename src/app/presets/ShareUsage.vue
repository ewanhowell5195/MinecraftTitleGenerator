<script setup>
  import { useShareUsage } from "#lib/presets/sharing.js"

  const { counted, full, text, pips } = useShareUsage()
</script>

<template>
  <div v-if="counted" class="usage" :class="{ full }" role="status">
    <span class="pips" aria-hidden="true">
      <i v-for="(left, index) of pips" :key="index" :class="{ left }"></i>
    </span>
    <span>{{ text }}</span>
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
