<script setup>
  import { ref, watch } from "vue"
  import { account } from "../lib/community.js"
  import { SUBMISSION_STATUSES } from "../lib/submissions.js"
  import { markNotificationsSeen, mySubmissions, notifications, submissionFileUrl, submissionPage } from "../lib/submissionsApi.js"
  import { CLIENT_KINDS } from "./kinds/index.js"
  import NotificationList from "./NotificationList.vue"
  import SubmissionForm from "./SubmissionForm.vue"

  const props = defineProps({
    fonts: { type: Array, required: true }
  })

  const prefill = Object.fromEntries(new URLSearchParams(location.search))
  const submissions = ref(null)
  const news = ref([])
  const error = ref("")

  async function load() {
    submissions.value = null
    news.value = []
    error.value = ""
    if (!account.value) return
    try {
      const [mine, latest] = await Promise.all([mySubmissions(), notifications()])
      submissions.value = mine
      news.value = latest
      if (latest.some(item => !item.seen)) await markNotificationsSeen()
    } catch (err) {
      error.value = err.message
    }
  }

  function sent({ id }) {
    location.assign(submissionPage(id))
  }

  watch(() => account.value?.id, load, { immediate: true })
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
  <section v-if="submissions?.length" class="section">
    <h2>Your submissions</h2>
    <ul class="submission-list">
      <li v-for="item of submissions" :key="item.id">
        <a :href="submissionPage(item.id)">
          <img v-if="CLIENT_KINDS[item.kind].image" :src="submissionFileUrl(item)" alt="" loading="lazy">
          <span class="name">{{ item.name }}</span>
          <span class="where">{{ CLIENT_KINDS[item.kind].summary(item, fonts) }}</span>
          <span class="status" :class="item.status">{{ SUBMISSION_STATUSES[item.status] }}</span>
        </a>
      </li>
    </ul>
  </section>
</template>
