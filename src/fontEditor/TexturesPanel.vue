<script setup>
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import SharedStrips from "./SharedStrips.vue"
  import { downloadFlatTexture, font, previewText as text, update } from "./store.js"

  function setStrips(strips, group = null) {
    update({ ...font.value, strips }, group)
  }
</script>

<template>
  <div class="settings">
    <section class="flow">
      <h3>Your own textures</h3>
      <p class="hint">Textures made for your font alone are painted onto a copy of its letters, like the ones every published font has. They're made outside the font editor, starting from this blank texture.</p>
      <Button class="blank" @click="downloadFlatTexture"><template #icon><Icon name="download" :size="14" /></template>Download a blank texture</Button>
    </section>

    <SharedStrips v-model:text="text" :font="font" :strips="font.strips" @update:strips="setStrips" />
  </div>
</template>

<style scoped>
  .blank {
    align-self: flex-start;
  }
</style>
