<script setup>
  import { computed } from "vue"
  import { TYPES } from "../lib/settings.js"
  import { duplicateLine, lineHidden, lineText, removeLine, selection, toggleLine, words } from "../lib/scene.js"
  import Button from "./Button.vue"
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
    <Button ghost @click="toggleLine(line[0])" v-tooltip="hidden ? 'Show' : 'Hide'" :aria-label="hidden ? 'Show' : 'Hide'" :aria-pressed="hidden"><template #icon><Icon :name="hidden ? 'hidden' : 'eye'" :size="16" /></template>
    </Button>
    <Button ghost @click="duplicateLine(line[0])" v-tooltip="'Duplicate'" aria-label="Duplicate"><template #icon><Icon name="copy" :size="16" /></template>
    </Button>
    <Button ghost @click="removeLine(line[0])" v-tooltip="'Delete'" aria-label="Delete"><template #icon><Icon name="trash" :size="16" /></template>
    </Button>
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
