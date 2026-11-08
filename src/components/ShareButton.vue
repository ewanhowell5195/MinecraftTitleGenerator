<script setup>
  import { ref } from "vue"
  import { showNotice } from "../lib/notices.js"
  import { startSavingPreset } from "../lib/presets.js"
  import { scene } from "../lib/scene.js"
  import { shareLink } from "../lib/share.js"
  import ContextMenu from "./ContextMenu.vue"
  import Icon from "./Icon.vue"
  import RenderDialog from "./RenderDialog.vue"

  const skipped = ref(0)
  const at = ref(null)
  const items = [
    { label: "Copy link", icon: "link", action: copyLink },
    { label: "Share publicly", icon: "share", action: () => startSavingPreset({ share: true }) }
  ]
  let closed = 0

  async function copyLink() {
    try {
      const made = shareLink()
      await navigator.clipboard.writeText(made.link)
      skipped.value = made.skipped
      if (!skipped.value) showNotice("Link copied")
    } catch (err) {
      showNotice(`Could not copy: ${err.message}`)
    }
  }

  function toggle(event) {
    if (performance.now() - closed < 300) return
    const rect = event.currentTarget.getBoundingClientRect()
    at.value = { x: rect.right, y: rect.bottom + 4 }
  }

  function close() {
    closed = performance.now()
    at.value = null
  }
</script>

<template>
  <div class="share">
    <button class="small" title="Share this title" :disabled="!scene.objects.length" @click="toggle">
      <Icon name="share" :size="16" />
      <span>Share</span>
    </button>
    <ContextMenu :items="at ? items : []" :at="at" @close="close" />
    <RenderDialog v-if="skipped" title="Link copied" close-title="Close" dismissable @close="skipped = 0">
      <div class="body">
        <p>{{ skipped === 1 ? "1 uploaded overlay" : `${skipped} uploaded overlays` }} could not be shared, so the link opens this title without {{ skipped === 1 ? "it" : "them" }}.</p>
        <button class="primary" @click="skipped = 0">OK</button>
      </div>
    </RenderDialog>
  </div>
</template>

<style scoped>
  .share {
    flex: none;
    margin-left: auto;
  }

  .body {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 16px;
    padding: 20px;
  }

  .body p {
    align-self: stretch;
    margin: 0;
    font-size: var(--font-base);
  }
</style>
