<script setup>
  import { onMounted, ref } from "vue"
  import { useRoute } from "vue-router"
  import { refreshAccount } from "../lib/community.js"
  import { loadFontList } from "../lib/font.js"
  import { loadStats } from "../lib/stats.js"
  import AccountPage from "./AccountPage.vue"
  import SubmissionsHome from "./SubmissionsHome.vue"
  import SubmissionView from "./SubmissionView.vue"
  import SubmitPage from "./SubmitPage.vue"

  const route = useRoute()
  const viewed = route.params.id ?? null
  const editing = route.path.replace(/\/$/, "").endsWith("/edit")
  const managing = route.meta.name === "account"
  const listing = route.meta.name === "submissions" && !viewed
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
      <SubmissionsHome v-else-if="listing" :fonts="fonts" />
      <SubmitPage v-else :fonts="fonts" />
    </template>
  </main>
</template>
