<script setup>
  import { ref } from "vue"
  import { showNotice } from "../lib/notices.js"
  import { startSavingPreset } from "../lib/presets.js"
  import { scene } from "../lib/scene.js"
  import { shareLink } from "../lib/share.js"
  import Icon from "./Icon.vue"
  import MenuButton from "./MenuButton.vue"
  import MessageDialog from "./MessageDialog.vue"

  const skipped = ref(0)
  const items = [
    { label: "Copy link", icon: "link", action: copyLink },
    { label: "Share publicly", icon: "share", action: () => startSavingPreset({ share: true }) }
  ]

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
</script>

<template>
  <div class="share">
    <MenuButton :disabled="!scene.objects.length" :items="items" end>
      <Icon name="share" :size="16" />
      <span>Share</span>
    </MenuButton>
    <MessageDialog v-if="skipped" title="Link copied" @close="skipped = 0">Links can't carry uploaded fonts, textures or overlays, so this one opens the title without {{ skipped === 1 ? "its upload" : `its ${skipped} uploads` }}. Save the title as a file to keep them.</MessageDialog>
  </div>
</template>

<style scoped>
  .share {
    flex: none;
    margin-left: auto;
  }
</style>
