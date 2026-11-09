<script setup>
  import { ref, watch } from "vue"
  import { account } from "../lib/community.js"
  import { markNotificationsSeen, mySubmissions, notifications, reviewQueue, submissionPage } from "../lib/submissionsApi.js"
  import NotificationList from "./NotificationList.vue"
  import SubmissionForm from "./SubmissionForm.vue"
  import SubmissionList from "./SubmissionList.vue"

  const props = defineProps({
    fonts: { type: Array, required: true }
  })

  const prefill = Object.fromEntries(new URLSearchParams(location.search))
  const submissions = ref(null)
  const waiting = ref(null)
  const news = ref([])
  const error = ref("")

  async function load() {
    submissions.value = null
    waiting.value = null
    news.value = []
    error.value = ""
    if (!account.value) return
    try {
      const [mine, latest, queue] = await Promise.all([mySubmissions(), notifications(), account.value.admin ? reviewQueue() : null])
      submissions.value = mine
      news.value = latest
      waiting.value = queue
      if (latest.some(item => !item.seen)) await markNotificationsSeen()
    } catch (err) {
      error.value = err.message
    }
  }

  function sent({ id }) {
    location.assign(submissionPage(id))
  }

  watch(() => [account.value?.id, account.value?.admin], load, { immediate: true })
</script>

<template>
  <section class="intro">
    <h1>Submit to the title generator</h1>
    <p>Made a font, texture, overlay, strip or tileable? Send it here, and once it's accepted it shows up in the generator for everyone.</p>
  </section>
  <SubmissionForm :fonts="fonts" :prefill="prefill" @done="sent" />
  <p v-if="error" class="hint bad">{{ error }}</p>
  <section v-if="news.length" class="section">
    <h2>Notifications</h2>
    <NotificationList :items="news" show-submission />
  </section>
  <section v-if="waiting?.length" class="section">
    <h2>Waiting for review</h2>
    <SubmissionList :items="waiting" :fonts="props.fonts" show-sender />
  </section>
  <section v-if="submissions?.length" class="section">
    <h2>Your submissions</h2>
    <SubmissionList :items="submissions" :fonts="props.fonts" />
  </section>
</template>
