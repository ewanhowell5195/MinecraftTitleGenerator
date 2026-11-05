<script setup>
  import { ref } from "vue"
  import { showNotice } from "../lib/notices.js"
  import { scene } from "../lib/scene.js"
  import { shareLink } from "../lib/share.js"
  import Icon from "./Icon.vue"
  import RenderDialog from "./RenderDialog.vue"

  const skipped = ref(0)

  async function share() {
    try {
      const made = shareLink()
      await navigator.clipboard.writeText(made.link)
      skipped.value = made.skipped
      if (!skipped.value) showNotice("Link copied")
    } catch (err) {
      showNotice(`Could not copy: ${err.message}`)
    }
  }
</script>

<template>
  <div class="share">
    <button class="small" title="Copy a link to this title" :disabled="!scene.objects.length" @click="share">
      <Icon name="share" :size="16" />
      <span>Share</span>
    </button>
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
