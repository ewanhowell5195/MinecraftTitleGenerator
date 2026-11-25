<script setup>
  import { DEFAULT_SAMPLE, fontBrowserTitle, useFontBrowser } from "#lib/panels/fontBrowser.js"
  import Button from "#c/Button.vue"
  import Checkbox from "#c/Checkbox.vue"
  import Dialog from "#c/Dialog.vue"
  import Dropdown from "#c/Dropdown.vue"
  import Notice from "#c/Notice.vue"

  const props = defineProps({
    kind: { type: String, required: true },
    current: { type: String, default: null }
  })

  const emit = defineEmits(["pick", "close"])
  const search = defineModel("search", { type: String, default: "" })
  const { categories, chosenCategories, clearFilters, count, error, filtered, google, hasMore, list, loading, more, observe, previewFamily, sampleOf, shown, sort, sorts, text, thumbnail, toggleCategory, typed, variable } = useFontBrowser({ kind: props.kind, current: props.current, search })

  function pick(entry) {
    emit("pick", entry.font)
    emit("close")
  }
</script>

<template>
  <Dialog :title="fontBrowserTitle(kind)" close-title="Close" large tall dismissable @close="emit('close')">
    <div class="browser">
      <div class="bar">
        <input type="text" v-model="search" :placeholder="google ? 'Search Google Fonts' : 'Search fonts'" aria-label="Search fonts" spellcheck="false">
        <input type="text" v-model="typed" :placeholder="`Preview text: ${DEFAULT_SAMPLE}`" aria-label="Preview text" spellcheck="false">
        <Dropdown class="sort" :options="sorts" v-model="sort" />
      </div>
      <div class="body">
        <aside v-if="google" class="filters">
          <div class="group">
            <span class="label">Category</span>
            <Checkbox v-for="category of categories" :key="category" :label="category" :model-value="chosenCategories.includes(category)" @update:model-value="toggleCategory(category, $event)" />
          </div>
          <div class="group">
            <span class="label">Technology</span>
            <Checkbox label="Variable" v-model="variable" />
          </div>
          <Button v-if="filtered" wide @click="clearFilters">Clear filters</Button>
        </aside>
        <div ref="list" class="list scroll">
          <Notice v-if="error">{{ error }}</Notice>
          <p v-else-if="loading" class="hint">Loading fonts...</p>
          <template v-else>
            <p class="hint count">{{ count }}</p>
            <button v-for="entry of shown" :key="entry.id" :ref="observe" type="button" class="font" :class="{ selected: entry.id === current }" :data-id="entry.id" @click="pick(entry)">
              <span class="meta">
                <span class="name">{{ entry.label }}</span>
                <span v-if="entry.author" class="hint ellipsis">{{ entry.author }}</span>
                <span v-if="google" class="hint tags">{{ entry.styles }}</span>
              </span>
              <span v-if="google" class="sample text" :class="{ shown: sampleOf(entry) }" :style="{ fontFamily: previewFamily(entry) }">{{ text }}</span>
              <span v-else-if="sampleOf(entry) === null" class="sample hint">This font has none of these characters</span>
              <span v-else class="sample picture"><img :src="sampleOf(entry) || thumbnail(entry)" alt=""></span>
            </button>
            <div v-if="hasMore" ref="more" class="more"></div>
          </template>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
  .browser {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) 180px;
    gap: 10px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 22px;
    flex: none;
    width: 190px;
    padding: 18px 20px;
    overflow-y: auto;
    border-right: 1px solid var(--line);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .list {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 14px 20px 20px;
  }

  .count {
    margin: 0 0 6px;
  }

  .font {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 10px;
    padding: 16px 12px;
    text-align: left;
    color: var(--text);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    user-select: none;
  }

  .font:hover {
    background: var(--field);
  }

  .font.selected {
    box-shadow: inset 3px 0 0 var(--accent);
    background: var(--field);
  }

  .meta {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }

  .name {
    flex: none;
    font-size: var(--font-md);
    font-weight: 600;
  }

  .tags {
    flex: none;
    margin-left: auto;
  }

  .sample {
    display: block;
    overflow: hidden;
    white-space: nowrap;
  }

  .sample.text {
    font-size: 44px;
    line-height: 1.25;
    opacity: 0;
    transition: opacity var(--duration);
  }

  .sample.text.shown {
    opacity: 1;
  }

  .sample.picture {
    height: 56px;
  }

  .sample img {
    height: 100%;
    max-width: none;
    image-rendering: pixelated;
  }

  .sample.hint {
    font-size: var(--font-md);
  }

  .more {
    flex: none;
    height: 1px;
  }

  @media (max-width: 800px) {
    .bar {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .sort {
      grid-column: 1 / -1;
    }

    .body {
      flex-direction: column;
    }

    .filters {
      flex-direction: row;
      flex-wrap: wrap;
      width: auto;
      max-height: 160px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }
  }
</style>
