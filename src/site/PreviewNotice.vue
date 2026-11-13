<script setup>
  import { computed, ref } from "vue"
  import { useRoute } from "vue-router"
  import Icon from "../components/Icon.vue"
  import { PREVIEW_NOTICE, isPreviewHost } from "../lib/previewSite.js"

  const KEY = "minecraft-title-preview-notice"

  const route = useRoute()
  const live = computed(() => `https://mctitlegenerator.com${route.fullPath}`)
  const shown = ref(isPreviewHost(location.hostname) && !dismissed())

  function dismissed() {
    try {
      return sessionStorage.getItem(KEY) === "hidden"
    } catch {
      return false
    }
  }

  function hide() {
    shown.value = false
    try {
      sessionStorage.setItem(KEY, "hidden")
    } catch {}
  }
</script>

<template>
  <aside v-if="shown" class="preview-notice" role="status">
    <p>{{ PREVIEW_NOTICE }} <a :href="live">Open this page on mctitlegenerator.com</a></p>
    <button type="button" aria-label="Hide this notice" @click="hide"><Icon name="close" :size="16" /></button>
  </aside>
</template>

<style scoped>
  .preview-notice {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    max-width: min(420px, 100vw - 32px);
    padding: 10px 10px 10px 14px;
    font-size: var(--font-sm);
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    box-shadow: 0 8px 24px rgb(0 0 0 / 40%);
  }

  .preview-notice p {
    margin: 0;
  }

  .preview-notice a {
    color: var(--accent);
  }

  .preview-notice button {
    flex: none;
    display: grid;
    place-items: center;
    padding: 2px;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    user-select: none;
  }

  .preview-notice button:hover {
    color: var(--text);
  }
</style>
