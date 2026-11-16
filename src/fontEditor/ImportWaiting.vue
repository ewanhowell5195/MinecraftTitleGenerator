<script setup>
  import Notice from "../components/Notice.vue"
  import Spinner from "../components/Spinner.vue"
  import EditorIntro from "./EditorIntro.vue"

  defineProps({
    name: { type: String, required: true },
    error: { type: String, default: "" }
  })
</script>

<template>
  <div class="import-waiting">
    <EditorIntro :title="`Import ${name}`" />
    <Notice v-if="error" class="error">{{ error }}</Notice>
    <div v-else class="reading">
      <Spinner />
      <p class="hint">Reading the font...</p>
    </div>
  </div>
</template>

<style scoped>
  .import-waiting {
    max-width: 1100px;
    margin: 0 auto;
  }

  .reading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 64px 16px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
</style>
