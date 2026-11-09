<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import Icon from "../components/Icon.vue"
  import { account } from "../lib/community.js"
  import { SUBMISSION_KINDS } from "../lib/submissionKinds/index.js"
  import { SUBMISSION_PARAM } from "../lib/submissionLink.js"
  import { SUBMISSION_STATUSES } from "../lib/submissions.js"
  import { markNotificationsSeen, notifications, submission, submissionFileUrl, withdrawSubmission } from "../lib/submissionsApi.js"
  import { KIND_COMPONENTS } from "./kinds/components.js"
  import { CLIENT_KINDS } from "./kinds/index.js"
  import NotificationList from "./NotificationList.vue"
  import SubmissionForm from "./SubmissionForm.vue"

  const props = defineProps({
    id: { type: Number, required: true },
    fonts: { type: Array, required: true }
  })

  const item = ref(null)
  const error = ref("")
  const text = ref("")
  const editing = ref(false)
  const busy = ref(false)
  const news = ref([])

  const client = computed(() => CLIENT_KINDS[item.value?.kind])
  const changeable = computed(() => item.value?.mine && item.value.status === "open")

  async function load() {
    try {
      item.value = await submission(props.id)
    } catch (err) {
      error.value = err.message
    }
  }

  async function loadNews() {
    if (!item.value?.mine) return
    news.value = (await notifications()).filter(entry => entry.submission === props.id)
    if (news.value.some(entry => !entry.seen)) await markNotificationsSeen()
  }

  async function withdraw() {
    if (!confirm(`Withdraw ${item.value.name}? It's removed from this site, but it can still be accepted.`)) return
    busy.value = true
    try {
      await withdrawSubmission(props.id)
      location.assign("/submit/")
    } catch (err) {
      error.value = err.message
      busy.value = false
    }
  }

  function saved(changed) {
    item.value = changed
    editing.value = false
  }

  onMounted(load)
  watch(() => item.value?.name, name => {
    if (name) document.title = `${name} | Submissions | Minecraft Title Generator`
  })
  watch(() => [item.value?.mine, account.value?.id], () => loadNews().catch(err => console.error(err)))
</script>

<template>
  <p v-if="error && !item" class="hint bad">{{ error }}</p>
  <template v-else-if="item">
    <section class="intro">
      <a class="hint" href="/submit/">Submit to the title generator</a>
      <h1>{{ item.name }}</h1>
      <p>{{ client.summary(item, fonts) }}, made by {{ item.credit }}.</p>
    </section>
    <SubmissionForm v-if="editing" :fonts="fonts" :initial="item" @done="saved" @cancel="editing = false" />
    <div v-else class="submission-view">
      <div class="preview flow">
        <component :is="KIND_COMPONENTS[item.kind].Preview" :fonts="fonts" :kind="item.kind" :target="item.target" :details="item.details" :initial="item" :url="submissionFileUrl(item)" :text="text || item.name" />
        <input type="text" v-model="text" :placeholder="item.name" spellcheck="false" aria-label="Preview text">
      </div>
      <div class="details flow">
        <span class="status" :class="item.status">{{ SUBMISSION_STATUSES[item.status] }}</span>
        <dl>
          <dt>Type</dt>
          <dd>{{ SUBMISSION_KINDS[item.kind].label }}</dd>
          <template v-for="row of client.rows(item, fonts)" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd><span v-if="row.colour" class="swatch" :style="{ background: row.colour }"></span>{{ row.value }}</dd>
          </template>
          <dt>Credit</dt>
          <dd>{{ item.credit }}</dd>
          <dt>Sent by</dt>
          <dd>{{ item.ownerName }}</dd>
        </dl>
        <p v-if="item.notes" class="notes">{{ item.notes }}</p>
        <div v-if="client.image" class="upload-preview"><img :src="submissionFileUrl(item)" alt=""></div>
        <div class="buttons">
          <a class="button primary" :href="`/app/?${SUBMISSION_PARAM}=${item.id}`">Open in generator</a>
          <a v-if="item.pullUrl" class="button" :href="item.pullUrl" target="_blank" rel="noopener"><Icon name="github" :size="16" />Pull request</a>
        </div>
        <div v-if="changeable" class="buttons">
          <button type="button" :disabled="busy" @click="editing = true"><Icon name="pencil" :size="16" />Edit</button>
          <button type="button" class="danger" :disabled="busy" @click="withdraw"><Icon name="trash" :size="16" />Withdraw</button>
        </div>
        <p v-if="error" class="hint bad">{{ error }}</p>
      </div>
    </div>
    <section v-if="news.length" class="section">
      <h2>Review</h2>
      <NotificationList :items="news" />
    </section>
  </template>
</template>
