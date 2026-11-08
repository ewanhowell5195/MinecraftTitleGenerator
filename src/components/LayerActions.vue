<script setup>
  import { computed } from "vue"
  import { TYPES } from "../lib/settings.js"
  import { duplicateLine, lineHidden, lineText, removeLine, selection, toggleLine, words } from "../lib/scene.js"
  import Icon from "./Icon.vue"

  const line = computed(() => words(selection.value[0]))
  const grouped = computed(() => line.value.length > 1)
  const hidden = computed(() => lineHidden(line.value[0]))
</script>

<template>
  <div class="actions">
    <Icon class="kind" :name="grouped ? 'layers' : 'text'" :size="16" />
    <div class="summary">
      <span class="name ellipsis">{{ lineText(line[0]) || "(empty)" }}</span>
      <span class="type ellipsis">{{ grouped ? `${line.length} words, ` : "" }}{{ TYPES[line[0].type].name }}</span>
    </div>
    <button class="icon-button" @click="toggleLine(line[0])" :title="hidden ? 'Show' : 'Hide'" :aria-pressed="hidden">
      <Icon :name="hidden ? 'hidden' : 'eye'" :size="18" />
    </button>
    <button class="icon-button" @click="duplicateLine(line[0])" title="Duplicate">
      <Icon name="copy" :size="18" />
    </button>
    <button class="icon-button" @click="removeLine(line[0])" title="Delete">
      <Icon name="trash" :size="18" />
    </button>
  </div>
</template>

<style scoped>
  .actions {
    grid-area: actions;
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    padding: 6px 10px 6px 16px;
    background: var(--surface);
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .kind {
    color: var(--faint);
  }

  .summary {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-left: 10px;
  }

  .name {
    font-size: var(--font-base);
    font-weight: 600;
  }

  .type {
    font-size: var(--font-xs);
    color: var(--faint);
  }

  @media (max-width: 800px) {
    .actions {
      padding: 4px 6px 4px 12px;
      border-right: none;
      border-top: 1px solid var(--line);
    }
  }
</style>
