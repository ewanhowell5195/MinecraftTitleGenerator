<script setup>
  import { onMounted, ref } from "vue"
  import { refreshAccount } from "../lib/community.js"
  import { loadFontList } from "../lib/font.js"
  import { loadStats } from "../lib/stats.js"
  import AccountPage from "./AccountPage.vue"
  import SubmissionsHome from "./SubmissionsHome.vue"
  import SubmissionView from "./SubmissionView.vue"

  const PAGE = /^\/submissions\/(\d+)(\/edit)?\/?$/

  const [, viewed = null, editing = null] = location.pathname.match(PAGE) ?? []
  const managing = location.pathname.startsWith("/account")
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
  <main class="page">
    <AccountPage v-if="managing" />
    <p v-else-if="error" class="hint bad">Couldn't load the fonts: {{ error }}</p>
    <template v-else-if="fonts">
      <SubmissionView v-if="viewed" :id="Number(viewed)" :fonts="fonts" :editing="!!editing" />
      <SubmissionsHome v-else :fonts="fonts" />
    </template>
  </main>
</template>
