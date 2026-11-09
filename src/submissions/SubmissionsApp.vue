<script setup>
  import { onMounted, ref } from "vue"
  import AccountMenu from "../components/AccountMenu.vue"
  import { refreshAccount } from "../lib/community.js"
  import { loadFontList } from "../lib/font.js"
  import { loadStats } from "../lib/stats.js"
  import SubmissionsHome from "./SubmissionsHome.vue"
  import SubmissionView from "./SubmissionView.vue"

  const PAGE = /^\/submissions\/(\d+)\/?$/

  const viewed = location.pathname.match(PAGE)?.[1] ?? null
  const fonts = ref(null)
  const error = ref("")

  onMounted(async () => {
    refreshAccount()
    loadStats().catch(err => console.error(err))
    try {
      fonts.value = await loadFontList()
    } catch (err) {
      error.value = err.message
    }
  })
</script>

<template>
  <header class="bar">
    <a class="brand" href="/"><img src="/favicon.svg" alt="" width="24" height="24"><span class="ellipsis">Minecraft Title Generator</span></a>
    <nav>
      <a class="button" href="/app/">Open the generator</a>
      <AccountMenu />
    </nav>
  </header>
  <main class="page">
    <p v-if="error" class="hint bad">Couldn't load the fonts: {{ error }}</p>
    <template v-else-if="fonts">
      <SubmissionView v-if="viewed" :id="Number(viewed)" :fonts="fonts" />
      <SubmissionsHome v-else :fonts="fonts" />
    </template>
  </main>
</template>
