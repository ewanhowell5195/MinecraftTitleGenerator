<script setup>
  import { onBeforeUnmount, ref } from "vue"
  import { scene } from "../lib/scene.js"
  import { shareLink } from "../lib/share.js"
  import Icon from "./Icon.vue"
  import RenderDialog from "./RenderDialog.vue"

  const notice = ref("")
  const skipped = ref(0)
  let noticing = null

  function flash(text) {
    notice.value = text
    clearTimeout(noticing)
    noticing = setTimeout(() => notice.value = "", 3000)
  }

  async function share() {
    notice.value = ""
    try {
      const made = shareLink()
      await navigator.clipboard.writeText(made.link)
      skipped.value = made.skipped
      if (!skipped.value) flash("Link copied")
    } catch (err) {
      flash(`Could not copy: ${err.message}`)
    }
  }

  onBeforeUnmount(() => clearTimeout(noticing))
</script>

<template>
  <div class="share">
    <button class="small" title="Copy a link to this title" :disabled="!scene.objects.length" @click="share">
      <Icon name="share" :size="16" />
      <span>Share</span>
    </button>
    <p v-if="notice" class="notice">{{ notice }}</p>
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
    position: relative;
    flex: none;
    margin-left: auto;
  }

  .notice {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 5;
    width: max-content;
    max-width: min(320px, 80vw);
    margin: 0;
    padding: 6px 10px;
    font-size: var(--font-md);
    background: var(--card);
    border: 1px solid var(--line);
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
