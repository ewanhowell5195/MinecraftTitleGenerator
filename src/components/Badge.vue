<script setup>
  defineProps({
    tone: { type: String, default: "neutral" }
  })
</script>

<template>
  <span class="badge" :class="tone"><slot></slot></span>
</template>

<style scoped>
  .badge {
    display: inline-flex;
    flex: none;
    align-items: center;
    padding: 1px 6px;
    font-size: var(--font-xs);
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
    color: var(--muted);
    background: var(--line);
  }

  .accent {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .good {
    color: var(--accent-text);
    background: var(--accent);
  }

  .bad {
    color: var(--danger-text);
    background: var(--danger);
  }
</style>
