<script setup>
  import { computed, onMounted, ref } from "vue"
  import { useRoute } from "vue-router"
  import { refreshAccount } from "../lib/state/account.js"
  import { loadFontList } from "../lib/font/font.js"
  import { loadStats } from "../lib/state/stats.js"
  import Notice from "../components/Notice.vue"
  import AccountPage from "./AccountPage.vue"
  import ConnectPage from "./ConnectPage.vue"
  import SubmissionsHome from "./SubmissionsHome.vue"
  import SubmissionView from "./SubmissionView.vue"
  import SubmitPage from "./SubmitPage.vue"

  const route = useRoute()
  const viewed = route.params.id ?? null
  const editing = computed(() => route.path.replace(/\/$/, "").endsWith("/edit"))
  const managing = route.meta.name === "account"
  const connecting = route.meta.name === "connect"
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
    <ConnectPage v-else-if="connecting" />
    <Notice v-else-if="error">Couldn't load the fonts: {{ error }}</Notice>
    <template v-else-if="fonts">
      <SubmissionView v-if="viewed" :id="Number(viewed)" :fonts="fonts" :editing="editing" />
      <SubmissionsHome v-else-if="listing" :fonts="fonts" />
      <SubmitPage v-else :fonts="fonts" />
    </template>
  </main>
</template>
