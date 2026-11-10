<script setup>
  import { ref } from "vue"
  import { useRoute } from "vue-router"
  import { encodeTitle } from "../lib/linkformat.js"
  import { pictureUrl } from "../lib/pictures.js"
  import { FILE_VERSION } from "../lib/settings.js"

  const route = useRoute()
  const code = encodeTitle({ version: FILE_VERSION, lines: [{ text: "404", font: "minecraft-ten", textureSource: "premade", texture: "smooth" }] }).code
  const failed = ref(false)
</script>

<template>
  <main class="missing wrap">
    <p v-if="failed" class="code">404</p>
    <img v-else class="sign" :src="pictureUrl({ code })" alt="404" width="935" height="381" @error="failed = true">
    <h1>Page not found</h1>
    <p>There's nothing at <code>{{ route.path }}</code>. The link may be wrong, or the page may have moved.</p>
    <RouterLink class="button primary big" to="/">Go to the home page</RouterLink>
  </main>
</template>

<style scoped>
  .missing {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: calc(100vh + 1px - var(--footer-gap));
    padding-top: 112px;
    padding-bottom: 48px;
    text-align: center;
  }

  .sign {
    width: min(440px, 100%);
    height: auto;
    aspect-ratio: 935 / 381;
  }

  .code {
    font-size: clamp(96px, 16vw, 160px);
    font-weight: 900;
    line-height: 1;
    color: var(--text);
  }

  h1 {
    margin-top: 20px;
    font-size: clamp(36px, 5.4vw, 56px);
    font-weight: 800;
    line-height: 1.05;
    color: var(--text);
  }

  h1 + p {
    max-width: 34em;
    margin-top: 14px;
    text-wrap: balance;
  }

  code {
    padding: 1px 6px;
    font-size: 0.9em;
    overflow-wrap: anywhere;
    color: var(--text);
    background: var(--card);
  }

  .button {
    margin-top: 28px;
  }
</style>
